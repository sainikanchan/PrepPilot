import pytest

from app.database import SessionLocal
from app.services import question_generation as qg


def _db():
    return SessionLocal()


def test_selection_respects_domain_difficulty_and_count():
    db = _db()
    try:
        qs = qg.select_questions(db, 999999, "data-science", "hard", 3)
        assert len(qs) == 3
        assert all(q.domain == "data-science" and q.difficulty == "hard" for q in qs)
        assert len({q.text for q in qs}) == 3
    finally:
        db.close()


def test_random_selection_varies_across_calls():
    db = _db()
    try:
        signatures = set()
        for _ in range(6):
            qs = qg.select_questions(db, 999999, "software-engineering", "medium", 2)
            signatures.add(tuple(sorted(q.text for q in qs)))
        assert len(signatures) > 1
    finally:
        db.close()


def test_validate_generated_accepts_wellformed():
    raw = {"questions": [{
        "text": "Explain the difference between TCP and UDP in distributed systems.",
        "category": "technical",
        "reference_answer": "TCP provides reliable ordered delivery with retransmission; UDP is connectionless with lower overhead and no guarantees.",
        "expected_concepts": ["TCP", "UDP", "reliability", "overhead"],
    }]}
    out = qg.validate_generated(raw, "software-engineering", "medium")
    assert len(out) == 1 and out[0]["source"] == "generated"


def test_validate_generated_rejects_bad_output():
    bad = {"questions": [
        {"text": "short", "category": "technical", "reference_answer": "x"*30, "expected_concepts": ["a", "b"]},
        {"text": "Tell me about your religion and how it affects work.", "category": "behavioral", "reference_answer": "x"*30, "expected_concepts": ["a", "b"]},
        {"text": "What is normalization in databases?", "category": "technical", "reference_answer": "short", "expected_concepts": ["a", "b"]},
        "not a dict",
    ]}
    assert qg.validate_generated(bad, "behavioral-hr", "easy") == []


def test_provider_success_uses_generated_questions(monkeypatch):
    payload = {"questions": [{
        "text": "Design a caching strategy for a read-heavy API with strict latency limits.",
        "category": "technical",
        "reference_answer": "Use a combination of in-memory caching, CDN, and cache invalidation on writes with TTL fallback.",
        "expected_concepts": ["caching", "latency", "invalidation", "TTL"],
    }]}
    monkeypatch.setattr(qg, "_call_provider", lambda prompt: payload)
    db = _db()
    try:
        qs = qg.select_questions(db, 999999, "software-engineering", "hard", 1)
        assert qs[0].source == "generated"
        assert qs[0].text.startswith("Design a caching strategy")
    finally:
        db.close()


def test_provider_failure_falls_back_to_bank(monkeypatch):
    def boom(prompt):
        raise TimeoutError("provider timeout")
    monkeypatch.setattr(qg, "_call_provider", boom)
    db = _db()
    try:
        qs = qg.select_questions(db, 999999, "software-engineering", "easy", 3)
        assert len(qs) == 3
        assert all(q.source == "question_bank" for q in qs)
    finally:
        db.close()


def test_missing_api_key_falls_back(monkeypatch):
    monkeypatch.setattr(qg, "OPENAI_API_KEY", "")
    db = _db()
    try:
        qs = qg.select_questions(db, 999999, "product-management", "medium", 3)
        assert len(qs) == 3
        assert all(q.source == "question_bank" for q in qs)
    finally:
        db.close()


GEMINI_OK = {"questions": [{
    "text": "Walk through how DNS resolution works from a browser request.",
    "category": "technical",
    "reference_answer": "The browser queries a recursive resolver, which walks root, TLD, and authoritative nameservers, caching results by TTL, until it returns the A or AAAA record.",
    "expected_concepts": ["DNS", "resolver", "TTL", "nameserver", "caching"],
}]}


def test_gemini_success_and_parsing(monkeypatch):
    monkeypatch.setattr(qg, "QUESTION_PROVIDER", "gemini")
    monkeypatch.setattr(qg, "_call_gemini", lambda prompt: GEMINI_OK)
    db = _db()
    try:
        qs = qg.select_questions(db, 999999, "software-engineering", "easy", 1)
        assert qs[0].source == "generated"
        assert qs[0].text.startswith("Walk through")
    finally:
        db.close()


def test_gemini_malformed_response_falls_back(monkeypatch):
    monkeypatch.setattr(qg, "QUESTION_PROVIDER", "gemini")
    def bad(prompt):
        raise RuntimeError("provider_invalid_json")
    monkeypatch.setattr(qg, "_call_gemini", bad)
    db = _db()
    try:
        qs = qg.select_questions(db, 999999, "software-engineering", "easy", 2)
        assert len(qs) == 2 and all(q.source == "question_bank" for q in qs)
    finally:
        db.close()


def test_gemini_empty_response_falls_back(monkeypatch):
    monkeypatch.setattr(qg, "QUESTION_PROVIDER", "gemini")
    def empty(prompt):
        raise RuntimeError("provider_blocked_or_empty")
    monkeypatch.setattr(qg, "_call_gemini", empty)
    db = _db()
    try:
        qs = qg.select_questions(db, 999999, "data-science", "medium", 2)
        assert len(qs) == 2 and all(q.source == "question_bank" for q in qs)
    finally:
        db.close()


def test_gemini_missing_key_falls_back(monkeypatch):
    monkeypatch.setattr(qg, "QUESTION_PROVIDER", "gemini")
    monkeypatch.setattr(qg, "GEMINI_API_KEY", "")
    db = _db()
    try:
        qs = qg.select_questions(db, 999999, "data-science", "medium", 2)
        assert len(qs) == 2 and all(q.source == "question_bank" for q in qs)
    finally:
        db.close()


def test_gemini_timeout_falls_back(monkeypatch):
    monkeypatch.setattr(qg, "QUESTION_PROVIDER", "gemini")
    def slow(prompt):
        raise RuntimeError("provider_timeout")
    monkeypatch.setattr(qg, "_call_gemini", slow)
    db = _db()
    try:
        qs = qg.select_questions(db, 999999, "behavioral-hr", "medium", 2)
        assert len(qs) == 2 and all(q.source == "question_bank" for q in qs)
    finally:
        db.close()


def test_gemini_http_error_falls_back(monkeypatch):
    monkeypatch.setattr(qg, "QUESTION_PROVIDER", "gemini")
    def err(prompt):
        raise RuntimeError("provider_http_error status=429")
    monkeypatch.setattr(qg, "_call_gemini", err)
    db = _db()
    try:
        qs = qg.select_questions(db, 999999, "product-management", "hard", 2)
        assert len(qs) == 2 and all(q.source == "question_bank" for q in qs)
    finally:
        db.close()


def test_gemini_invalid_questions_rejected(monkeypatch):
    monkeypatch.setattr(qg, "QUESTION_PROVIDER", "gemini")
    monkeypatch.setattr(qg, "_call_gemini", lambda prompt: {"questions": [{"text": "hi"}]})
    db = _db()
    try:
        qs = qg.select_questions(db, 999999, "behavioral-hr", "easy", 2)
        assert len(qs) == 2 and all(q.source == "question_bank" for q in qs)
    finally:
        db.close()


def test_gemini_fills_requested_count(monkeypatch):
    monkeypatch.setattr(qg, "QUESTION_PROVIDER", "gemini")
    payload = {"questions": [GEMINI_OK["questions"][0], {
        "text": "Explain how browsers render a page from HTML to pixels.",
        "category": "technical",
        "reference_answer": "HTML is parsed into the DOM, CSS into the CSSOM, combined into a render tree, laid out, and painted to the screen.",
        "expected_concepts": ["DOM", "CSSOM", "layout", "paint"],
    }]}
    monkeypatch.setattr(qg, "_call_gemini", lambda prompt: payload)
    db = _db()
    try:
        qs = qg.select_questions(db, 999999, "software-engineering", "medium", 3)
        assert len(qs) == 3
        assert len({q.text for q in qs}) == 3
        sources = {q.source for q in qs}
        assert "generated" in sources and "question_bank" in sources
    finally:
        db.close()


def test_provider_selection_dispatch(monkeypatch):
    calls = []
    monkeypatch.setattr(qg, "QUESTION_PROVIDER", "gemini")
    monkeypatch.setattr(qg, "_call_gemini", lambda p: calls.append("gemini") or None)
    monkeypatch.setattr(qg, "OPENAI_API_KEY", "x")
    qg._call_provider("prompt")
    assert calls == ["gemini"]

    calls = []
    monkeypatch.setattr(qg, "QUESTION_PROVIDER", "openai")
    monkeypatch.setattr(qg, "OPENAI_API_KEY", "")
    qg._call_provider("prompt")  # openai path returns None without making a call
    assert calls == []
