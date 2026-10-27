"""Hybrid question-generation service.

Behavior:
1. If a provider API key is configured, attempt dynamic generation first.
2. Validate every generated question; drop anything malformed.
3. Fill any shortfall (or the whole request when the provider fails or is
   unavailable) with randomly shuffled questions from the existing bank.
4. Within a session, never repeat a question. Across sessions, prefer
   questions the same user has not seen recently (best effort).

API keys are read from backend environment variables only.
"""

import json
import logging
import random
import re
import urllib.request
import urllib.error

from sqlalchemy.orm import Session

from ..config import (
    GEMINI_API_KEY,
    GEMINI_BASE_URL,
    GEMINI_MODEL,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    OPENAI_MODEL,
    QUESTION_GEN_TIMEOUT_SECONDS,
    QUESTION_PROVIDER,
)
from ..models import InterviewSession, Question

logger = logging.getLogger(__name__)

BEHAVIORAL_DOMAINS = {"product-management", "behavioral-hr"}
DIFFICULTIES = ("easy", "medium", "hard")

DIFFICULTY_RULES = {
    "easy": (
        "Fundamental concepts and definitions; basic examples and straightforward "
        "explanations suitable for beginners."
    ),
    "medium": (
        "Application of concepts with practical scenarios and problem solving; "
        "the candidate must explain their reasoning."
    ),
    "hard": (
        "Complex scenarios and trade-offs requiring deep technical understanding, "
        "analysis, design decisions, or debugging reasoning."
    ),
}

UNSAFE_PATTERN = re.compile(
    r"\b(race|religion|gender|sexual|disability|nationality|age|pregnant|marital|political)\b",
    re.IGNORECASE,
)


def domain_category(domain: str) -> str:
    return "behavioral" if domain in BEHAVIORAL_DOMAINS else "technical"


def build_prompt(domain: str, difficulty: str, count: int) -> str:
    category = domain_category(domain)
    return (
        f"Generate {count} distinct interview questions for the domain '{domain}' "
        f"at '{difficulty}' difficulty. Difficulty rules: {DIFFICULTY_RULES[difficulty]} "
        f"Question type: {category}. Rules: each question must be relevant to the "
        f"domain, match the difficulty's reasoning depth, be clear and answerable, "
        f"must NOT contain its own answer, must be unique, and must not be about "
        f"personal protected characteristics. For each question provide: "
        f'text (string), category ("{category}"), reference_answer (string), '
        f"expected_concepts (array of 4-7 short concept strings). "
        f'Respond with ONLY a JSON object of the form {{"questions": [...]}}.'
    )


def validate_generated(raw, domain: str, difficulty: str):
    """Return a list of valid question dicts from provider output."""
    if isinstance(raw, dict):
        items = raw.get("questions")
    else:
        items = raw
    if not isinstance(items, list):
        return []
    valid = []
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        text = item.get("text")
        reference = item.get("reference_answer")
        concepts = item.get("expected_concepts")
        category = item.get("category", domain_category(domain))
        if (
            not isinstance(text, str) or len(text.strip()) < 15
            or not isinstance(reference, str) or len(reference.strip()) < 20
            or not isinstance(concepts, list) or len(concepts) < 2
            or category not in {"technical", "behavioral"}
        ):
            continue
        normalized = re.sub(r"\W+", " ", text.lower()).strip()
        if normalized in seen or UNSAFE_PATTERN.search(text):
            continue
        # Reject questions whose text leaks the reference answer opening.
        if reference.strip().split(".")[0].lower()[:40] and reference.strip().split(".")[0].lower()[:40] in text.lower():
            continue
        seen.add(normalized)
        valid.append({
            "domain": domain,
            "difficulty": difficulty,
            "category": category,
            "text": text.strip(),
            "reference_answer": reference.strip(),
            "expected_concepts": [str(c) for c in concepts][:8],
            "star_required": category == "behavioral",
            "source": "generated",
        })
    return valid


def _call_gemini(prompt: str):
    """Generate via Google's Gemini generateContent API. Isolated for tests."""
    if not GEMINI_API_KEY:
        return None
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.8},
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{GEMINI_BASE_URL}/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=QUESTION_GEN_TIMEOUT_SECONDS) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"provider_http_error status={exc.code}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"provider_connection_error reason={exc.reason!r}") from exc
    except TimeoutError:
        raise RuntimeError("provider_timeout") from None
    try:
        candidates = body.get("candidates") or []
        parts = candidates[0]["content"]["parts"]
        text = "".join(part.get("text", "") for part in parts)
    except (KeyError, IndexError, TypeError):
        raise RuntimeError("provider_blocked_or_empty") from None
    if not text.strip():
        raise RuntimeError("provider_blocked_or_empty")
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise RuntimeError("provider_invalid_json")
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise RuntimeError("provider_invalid_json") from exc


def _call_provider(prompt: str):
    """Dispatch to the configured provider. Isolated so tests can mock it."""
    if QUESTION_PROVIDER == "gemini":
        logger.info("Question generation: provider=gemini key_configured=%s", bool(GEMINI_API_KEY))
        return _call_gemini(prompt)
    logger.info("Question generation: provider=openai key_configured=%s", bool(OPENAI_API_KEY))
    if not OPENAI_API_KEY:
        return None
    payload = json.dumps({
        "model": OPENAI_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.8,
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{OPENAI_BASE_URL}/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=QUESTION_GEN_TIMEOUT_SECONDS) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # Safe category only: status code and error class, never headers/body.
        raise RuntimeError(f"provider_http_error status={exc.code}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"provider_connection_error reason={exc.reason!r}") from exc
    except TimeoutError:
        raise RuntimeError("provider_timeout") from None
    content = body["choices"][0]["message"]["content"]
    match = re.search(r"\{.*\}", content, re.DOTALL)
    if not match:
        raise RuntimeError("provider_invalid_json")
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise RuntimeError("provider_invalid_json") from exc


def _recent_question_ids(db: Session, user_id: int, limit_sessions: int = 3):
    sessions = (
        db.query(InterviewSession)
        .filter(InterviewSession.user_id == user_id)
        .order_by(InterviewSession.id.desc())
        .limit(limit_sessions)
        .all()
    )
    seen = set()
    for session in sessions:
        seen.update(session.question_ids or [])
    return seen


def select_questions(db: Session, user_id: int, domain: str, difficulty: str, count: int):
    """Return exactly `count` Question rows for the interview, or raise.

    Raises ValueError with a user-safe message when not enough unique,
    on-domain, on-difficulty questions can be produced.
    """
    if difficulty not in DIFFICULTIES:
        raise ValueError("Difficulty must be easy, medium, or hard")

    chosen = []
    used_texts = set()

    # 1) Dynamic generation when a provider is configured.
    try:
        raw = _call_provider(build_prompt(domain, difficulty, count))
        for q in validate_generated(raw, domain, difficulty):
            if len(chosen) >= count:
                break
            existing = db.query(Question).filter(Question.text == q["text"]).first()
            row = existing or Question(**q)
            if existing is None:
                db.add(row)
                db.flush()
            chosen.append(row)
            used_texts.add(re.sub(r"\W+", " ", q["text"].lower()).strip())
    except Exception as exc:  # provider failure/timeout/parse error
        # Log a safe category only — never the API key, headers, or body.
        logger.warning("Question generation provider failed: %s", exc)
        db.rollback()

    # 2) Fallback / fill from shuffled question bank, avoiding recent usage.
    pool = db.query(Question).filter(Question.domain == domain, Question.difficulty == difficulty).all()
    recent_ids = _recent_question_ids(db, user_id)
    random.shuffle(pool)
    fresh = [q for q in pool if q.id not in recent_ids]
    stale = [q for q in pool if q.id in recent_ids]
    random.shuffle(fresh)
    random.shuffle(stale)
    for q in fresh + stale:
        if len(chosen) >= count:
            break
        normalized = re.sub(r"\W+", " ", q.text.lower()).strip()
        if any(c.id == q.id for c in chosen) or normalized in used_texts:
            continue
        chosen.append(q)
        used_texts.add(normalized)

    if len(chosen) < count:
        raise ValueError(
            f"Only {len(chosen)} unique questions are available for this domain/difficulty."
        )
    return chosen
