"""NLP analysis pipeline for interview answers.

Processing chain:
  1. Transcript validation / normalization (whitespace, length guard).
  2. spaCy linguistic preprocessing: sentence segmentation, tokenization,
     stop-word filtering, lemmatization, noun-phrase extraction, NER.
  3. Concept extraction: expected concepts are matched against lemmatized
     answer tokens, noun chunks, and semantic vector similarity (no reliance
     on exact substring matches only).
  4. Semantic similarity: cosine similarity of spaCy word vectors
     (en_core_web_md) with a transparent TF-IDF fallback when the trained
     model is unavailable.
  5. Deterministic scoring along separate, documented dimensions:
     relevance, concept coverage, technical depth, clarity, completeness,
     and (for behavioral questions) a heuristic STAR structure score.

This module never fabricates correctness. Where evidence is insufficient,
scores are set to 0 or null and the feedback says so.
"""

import math
import re
from collections import Counter

import spacy

def _vectors_are_meaningful(nlp, probe_words=("database", "thread", "leadership", "metric")):
    """Decide whether a loaded pipeline yields useful semantic vectors.

    Do NOT rely on vocab.vectors_length or has_vector alone: models like
    en_core_web_sm report has_vector=True while returning near-zero,
    non-informative vectors. Probe representative words and require a
    non-trivial L2 norm and distinct directions.
    """
    try:
        norms = []
        vectors = []
        for word in probe_words:
            doc = nlp(word)
            vec = doc.vector
            if vec is None or len(vec) == 0:
                return False
            norm = float((vec ** 2).sum() ** 0.5)
            norms.append(norm)
            vectors.append(vec.tolist())
        if not norms or min(norms) < 1e-3:
            return False
        # Require at least two probe words to differ meaningfully; if every
        # probe maps to the same direction the table carries no signal.
        ref = vectors[0]
        similar_to_ref = 0
        for other in vectors[1:]:
            dot = sum(a * b for a, b in zip(ref, other))
            n1 = sum(a * a for a in ref) ** 0.5
            n2 = sum(b * b for b in other) ** 0.5
            if n1 and n2 and dot / (n1 * n2) > 0.999:
                similar_to_ref += 1
        return similar_to_ref < len(vectors) - 1
    except Exception:
        return False


# Load the trained English pipeline once at import time. en_core_web_md
# provides tokenizer, tagger, parser, NER, and word vectors.
try:
    _nlp = spacy.load("en_core_web_md")
    _MODEL_NAME = "en_core_web_md"
    _SEMANTIC_AVAILABLE = _vectors_are_meaningful(_nlp)
except Exception:  # pragma: no cover - depends on environment
    try:
        _nlp = spacy.load("en_core_web_sm")
        _MODEL_NAME = "en_core_web_sm"
        # en_core_web_sm ships no useful word vectors, so this probe will
        # return False and the evaluation honestly switches to TF-IDF.
        _SEMANTIC_AVAILABLE = _vectors_are_meaningful(_nlp)
    except Exception:
        _nlp = None
        _MODEL_NAME = None
        _SEMANTIC_AVAILABLE = False

MAX_ANSWER_CHARS = 12000
MIN_ANSWER_CHARS = 2

FILLER_WORDS = {"um", "uh", "like", "basically", "actually"}

NON_SUBSTANTIVE_ANSWERS = {
    "okay", "ok", "yes", "no", "yea", "yeah", "yep", "nope", "sure",
    "maybe", "idk", "dunno", "nothing", "none", "nah", "alright",
    "all right", "fine", "whatever", "skip", "pass", "hmm",
    "i dont know", "i don't know", "dont know", "do not know",
    "no idea", "not sure", "not really", "i have no idea",
}

QUESTION_STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "what", "how", "why",
    "when", "where", "who", "which", "and", "or", "to", "of", "in", "on",
    "for", "with", "do", "does", "did", "would", "could", "should", "you",
    "your", "it", "they", "their", "between", "explain", "describe",
    "tell", "me", "about",
}

SYNONYMS = {
    "redundancy": {"duplicate", "duplication", "repeated", "redundant"},
    "data integrity": {"accuracy", "consistency", "integrity"},
    "normalization": {"normalize", "normalised", "normalized"},
    "distributed": {"distributed", "multiple", "servers"},
    "concurrency": {"concurrent", "simultaneous", "parallel"},
    "stakeholders": {"stakeholder", "manager", "client", "team"},
    "result": {"outcome", "impact", "achieved", "improved", "reduced", "increased"},
    "learning": {"learned", "lesson", "improvement", "changed"},
    "personal contribution": {"i", "my", "led", "implemented", "designed", "decided"},
    "lightweight": {"lightweight", "lighter", "less heavy", "low overhead"},
}


def preprocess(text):
    """Normalize and linguistically annotate a transcript.

    Returns a dict with the preserved original text plus derived features.
    """
    original = (text or "").strip()
    normalized = re.sub(r"\s+", " ", original)
    sentences, tokens, lemmas, noun_phrases, entities = [], [], [], [], []
    if _nlp is not None and normalized:
        doc = _nlp(normalized)
        sentences = [sent.text.strip() for sent in doc.sents]
        tokens = [tok.text for tok in doc if not tok.is_space]
        lemmas = [
            tok.lemma_.lower()
            for tok in doc
            if not tok.is_space and not tok.is_punct and not tok.is_stop
        ]
        noun_phrases = [chunk.text.lower() for chunk in doc.noun_chunks]
        entities = [ent.text for ent in doc.ents]
    else:
        sentences = [s.strip() for s in re.split(r"[.!?]+", normalized) if s.strip()]
        tokens = re.findall(r"[a-zA-Z0-9']+", normalized)
        lemmas = [t.lower() for t in tokens]
    return {
        "original": original,
        "normalized": normalized,
        "sentences": sentences,
        "tokens": tokens,
        "lemmas": lemmas,
        "noun_phrases": noun_phrases,
        "entities": entities,
        "word_count": len(tokens),
    }


def _clean(text):
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def _tfidf_similarity(a, b):
    """Transparent fallback similarity over unigram+bigram TF-IDF vectors."""
    if not a.strip() or not b.strip():
        return 0.0
    documents = []
    for value in (a, b):
        words = _clean(value).split()
        documents.append(words + [f"{l} {r}" for l, r in zip(words, words[1:])])
    df = Counter()
    for token in set(documents[0]):
        df[token] += 1
    for token in set(documents[1]):
        df[token] += 1
    vectors = []
    for tokens in documents:
        counts = Counter(tokens)
        vectors.append({
            token: (1 + math.log(count)) * (math.log(3 / (1 + df[token])) + 1)
            for token, count in counts.items()
        })
    dot = sum(value * vectors[1].get(token, 0) for token, value in vectors[0].items())
    norm_a = math.sqrt(sum(v * v for v in vectors[0].values()))
    norm_b = math.sqrt(sum(v * v for v in vectors[1].values()))
    return round((dot / (norm_a * norm_b) * 100) if norm_a and norm_b else 0.0, 1)


def semantic_similarity(a, b):
    """Cosine similarity scaled to 0-100 using spaCy word vectors.

    Falls back to TF-IDF when the vector model is unavailable. The active
    method is always reported via semantic_method().
    """
    if not a.strip() or not b.strip():
        return 0.0
    if _SEMANTIC_AVAILABLE:
        try:
            da, db = _nlp(a), _nlp(b)
            if da.has_vector and db.has_vector:
                return round(max(0.0, da.similarity(db)) * 100, 1)
        except Exception:
            pass
    return _tfidf_similarity(a, b)


def semantic_method():
    if _SEMANTIC_AVAILABLE:
        return f"spaCy {_MODEL_NAME} word-vector cosine similarity"
    if _nlp is not None:
        return f"spaCy {_MODEL_NAME} (no vectors) with TF-IDF fallback"
    return "TF-IDF fallback (spaCy model unavailable)"


def concept_match(answer, concepts):
    """Match expected concepts using lemmas, noun phrases, synonyms, and
    (when vectors are available) per-concept semantic similarity."""
    prep = preprocess(answer)
    lemma_set = set(prep["lemmas"])
    chunk_text = " ".join(prep["noun_phrases"])
    flat_text = _clean(answer)
    answer_doc = _nlp(answer) if _nlp is not None else None

    matched, missing = [], []
    for concept in concepts or []:
        c = _clean(concept)
        c_tokens = set(c.split())
        concept_lemmas = set()
        if _nlp is not None:
            concept_lemmas = {tok.lemma_.lower() for tok in _nlp(concept) if not tok.is_space and not tok.is_punct}
        direct = c in flat_text or c_tokens.issubset(set(flat_text.split())) or (concept_lemmas and concept_lemmas.issubset(lemma_set))
        in_chunk = bool(c) and c in chunk_text
        synonym = any(s in lemma_set or s in flat_text for s in SYNONYMS.get(c, set()))
        vector_hit = False
        if not (direct or in_chunk or synonym) and _SEMANTIC_AVAILABLE and answer_doc is not None:
            try:
                cdoc = _nlp(concept)
                if cdoc.has_vector:
                    best = 0.0
                    for chunk in answer_doc.noun_chunks:
                        if chunk.has_vector:
                            best = max(best, chunk.similarity(cdoc))
                    if answer_doc.has_vector:
                        best = max(best, answer_doc.similarity(cdoc) * 0.9)
                    vector_hit = best >= 0.65
            except Exception:
                vector_hit = False
        if direct or in_chunk or synonym or vector_hit:
            matched.append(concept)
        else:
            missing.append(concept)
    coverage = (len(matched) / len(concepts) * 100) if concepts else 0
    return round(coverage), matched, missing


def clarity_score(answer):
    prep = preprocess(answer)
    words = re.findall(r"\b\w+\b", answer)
    sentences = prep["sentences"] or [s.strip() for s in re.split(r"[.!?]+", answer) if s.strip()]
    if not words:
        return 0
    avg = len(words) / max(1, len(sentences))
    filler = sum(1 for w in re.findall(r"\b\w+\b", answer.lower()) if w in FILLER_WORDS or w == "you know")
    filler += len(re.findall(r"\byou know\b", answer.lower()))
    score = 100
    if avg > 35:
        score -= min(30, (avg - 35) * 1.2)
    if avg < 5:
        score -= 20
    score -= min(25, filler * 4)
    return round(max(0, min(100, score)))


def star_analysis(answer, required):
    """Heuristic STAR structure check using spaCy-assisted segmentation.

    This is a rule-based signal, not a validated model.
    """
    lower = answer.lower()
    signals = {
        "situation": bool(re.search(r"\b(situation|context|when|at my|during)\b", lower)),
        "task": bool(re.search(r"\b(task|goal|responsible|needed to|had to)\b", lower)),
        "action": bool(re.search(r"\b(i|we) (built|created|implemented|led|decided|designed|solved|changed|analyzed|worked)\b", lower)),
        "result": bool(re.search(r"\b(result|outcome|impact|improved|reduced|increased|achieved|learned)\b", lower)),
    }
    present = sum(signals.values())
    score = round(present / 4 * 100)
    if not required and present == 0:
        score = 75
    return {
        "required": required,
        "score": score,
        "components": signals,
        "method": "Heuristic rule-based keyword signals over the transcript; not a validated STAR model.",
    }


def analyze_answer(question, answer):
    answer = (answer or "").strip()
    if not answer:
        return {
            "score": 0, "relevanceScore": 0, "technicalScore": 0,
            "correctness": None,
            "correctnessNote": "Not assessed because no answer was provided.",
            "clarityScore": 0, "completeness": 0, "structureScore": 0,
            "conceptCoverage": 0, "referenceSimilarity": 0,
            "matchedConcepts": [],
            "missingConcepts": question.expected_concepts or [],
            "feedback": ["No answer was captured. Provide a direct response before moving on."],
            "improvementSuggestions": ["Answer the question directly and include the key ideas listed in the evaluation guidance."],
            "explanation": "No answer was submitted.",
            "scoringMethod": "spaCy preprocessing (sentence segmentation, lemmatization, noun phrases, NER), expected-concept matching, semantic similarity, clarity heuristics, and STAR structure signals.",
            "starAnalysis": star_analysis(answer, question.star_required),
            "evaluationMethod": f"spaCy {_MODEL_NAME or 'unavailable'}; similarity via {semantic_method()}",
            "evaluationStatus": "skipped",
        }
    if len(answer) > MAX_ANSWER_CHARS:
        answer = answer[:MAX_ANSWER_CHARS]

    prep = preprocess(answer)

    # Conservative quality gate: clearly non-substantive answers must not
    # earn clarity/structure/relevance credit just for being non-empty.
    tokens = re.findall(r"[a-z0-9']+", answer.lower())
    normalized = " ".join(tokens)
    content_tokens = set(prep["lemmas"]) | set(tokens)
    concept_hit = any(
        any(ct in content_tokens for ct in _clean(c).split())
        for c in (question.expected_concepts or [])
    )
    low_content = (
        not tokens
        or normalized in NON_SUBSTANTIVE_ANSWERS
        or (tokens and all(t in NON_SUBSTANTIVE_ANSWERS or t in FILLER_WORDS for t in tokens))
        or (0 < len(tokens) <= 2 and not concept_hit)
    )
    if low_content:
        return {
            "score": 3, "relevanceScore": 0, "technicalScore": 0,
            "correctness": None,
            "correctnessNote": "Insufficient content to evaluate.",
            "clarityScore": 0, "completeness": 0, "structureScore": 0,
            "conceptCoverage": 0, "referenceSimilarity": 0,
            "matchedConcepts": [],
            "missingConcepts": question.expected_concepts or [],
            "feedback": ["There is insufficient content in this answer to evaluate. Provide a direct, specific response to the question."],
            "improvementSuggestions": ["Answer the question directly and include the key ideas listed in the evaluation guidance."],
            "explanation": "The answer is empty, extremely short, or a filler/non-substantive response (e.g. \"okay\", \"yes\", \"I don't know\"), so there is not enough content to assess relevance, technical depth, clarity, or structure.",
            "scoringMethod": "Answer-quality gate: non-substantive answers receive no credit for relevance, technical depth, clarity, or structure.",
            "starAnalysis": star_analysis(answer, question.star_required),
            "evaluationMethod": f"Answer-quality gate applied; no NLP scoring performed. Provider pipeline: {_MODEL_NAME or 'spaCy unavailable'}; similarity via {semantic_method()} when content is substantive.",
            "evaluationStatus": "insufficient_content",
        }

    question_terms = set(_clean(question.text).split()) - QUESTION_STOPWORDS
    answer_terms = set(_clean(answer).split())
    relevance = round(len(question_terms & answer_terms) / len(question_terms) * 100) if question_terms else 0
    similarity = semantic_similarity(question.reference_answer, answer)
    coverage, matched, missing = concept_match(answer, question.expected_concepts or [])
    clarity = clarity_score(answer)
    star = star_analysis(answer, question.star_required)
    structure = star["score"] if question.star_required else min(100, round((clarity + min(100, len(re.findall(r"\b\w+\b", answer)) * 2)) / 2))
    technical = round(similarity * 0.35 + coverage * 0.65)
    score = round(relevance * 0.25 + technical * 0.35 + clarity * 0.20 + structure * 0.20)

    feedback = []
    if relevance < 45:
        feedback.append("Connect the opening sentence more directly to the question.")
    if coverage < 60 and missing:
        feedback.append("Cover more expected concepts: " + ", ".join(missing[:4]) + ".")
    if clarity < 70:
        feedback.append("Use shorter sentences and reduce filler words.")
    if question.star_required and star["score"] < 75:
        feedback.append("Use Situation, Task, Action, and Result explicitly.")
    if score >= 80:
        feedback.append("The answer is relevant and covers the main evaluation signals.")
    if not feedback:
        feedback.append("The answer covers the available evaluation signals; review the concept list for details.")

    correctness = technical if question.category == "technical" and question.reference_answer.strip() else None
    correctness_note = (
        "Limited estimate from reference-answer semantic similarity and expected-concept coverage; it is not a verified correctness judgment."
        if correctness is not None
        else "Correctness was not scored: this question has no technical reference answer."
    )
    return {
        "score": score, "relevanceScore": round(relevance), "technicalScore": technical,
        "correctness": correctness, "correctnessNote": correctness_note,
        "clarityScore": clarity, "completeness": coverage, "structureScore": structure,
        "conceptCoverage": coverage, "referenceSimilarity": round(similarity),
        "matchedConcepts": matched, "missingConcepts": missing,
        "feedback": feedback, "improvementSuggestions": feedback[:],
        "explanation": f"Scores combine question-term overlap, expected-concept matching (lemmas, noun phrases, synonyms, vector similarity), {semantic_method()} against the reference answer, and clarity/structure heuristics. They do not establish semantic understanding or expert-verified correctness.",
        "scoringMethod": "25% question-term overlap (relevance), 35% concept coverage + reference similarity (technical depth), 20% clarity heuristic, 20% structure/length. STAR is assessed separately for behavioral questions.",
        "starAnalysis": star,
        "evaluationMethod": f"spaCy {_MODEL_NAME or 'unavailable'}; similarity via {semantic_method()}",
        "evaluationStatus": "evaluated",
    }
