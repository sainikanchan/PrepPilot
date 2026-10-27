import pytest

from app.services import nlp_service as n


class _FakeDoc:
    def __init__(self, vec):
        import numpy as np

        self.vector = np.array(vec, dtype="float32")
        self.has_vector = bool(vec)


class _FakeNLPZero:
    """Simulates a pipeline whose vectors are all zero (no useful vectors)."""

    def __init__(self):
        self.vocab = type("V", (), {"vectors_length": 0})()

    def __call__(self, text):
        return _FakeDoc([0.0] * 96)


class _FakeNLPConstant:
    """Every word maps to the same direction -> uninformative vectors."""

    def __call__(self, text):
        return _FakeDoc([1.0] + [0.0] * 95)


class _FakeNLPMeaningful:
    _assigned = {}

    def __call__(self, text):
        # Orthogonal pseudo-vectors, deterministically assigned per input word.
        if text not in self._assigned:
            self._assigned[text] = len(self._assigned) % 4
        idx = self._assigned[text]
        vec = [0.0] * 96
        vec[idx * 24 : idx * 24 + 24] = [1.0] * 24
        return _FakeDoc(vec)


def test_zero_vector_model_is_rejected():
    assert n._vectors_are_meaningful(_FakeNLPZero()) is False


def test_constant_vector_model_is_rejected():
    assert n._vectors_are_meaningful(_FakeNLPConstant()) is False


def test_meaningful_model_is_accepted():
    assert n._vectors_are_meaningful(_FakeNLPMeaningful()) is True


def test_tfidf_fallback_when_vectors_unavailable(monkeypatch):
    monkeypatch.setattr(n, "_nlp", None)
    monkeypatch.setattr(n, "_MODEL_NAME", None)
    monkeypatch.setattr(n, "_SEMANTIC_AVAILABLE", False)
    score = n.semantic_similarity("data integrity and redundancy", "reduce redundancy for data integrity")
    assert 0 <= score <= 100
    assert n.semantic_method() == "TF-IDF fallback (spaCy model unavailable)"


def test_method_label_reflects_actual_path(monkeypatch):
    monkeypatch.setattr(n, "_MODEL_NAME", "en_core_web_md")
    monkeypatch.setattr(n, "_SEMANTIC_AVAILABLE", True)
    assert "spaCy" in n.semantic_method()
    monkeypatch.setattr(n, "_SEMANTIC_AVAILABLE", False)
    assert "TF-IDF fallback" in n.semantic_method()


def test_real_model_reports_itself():
    # en_core_web_md is already installed in the dev venv; this test does not
    # download anything and skips cleanly when the model is absent.
    if n._MODEL_NAME is None:
        pytest.skip("No spaCy model loaded")
    assert n._MODEL_NAME in n.semantic_method()
    if n._SEMANTIC_AVAILABLE:
        assert "word-vector cosine similarity" in n.semantic_method()
    else:
        assert "TF-IDF fallback" in n.semantic_method()


def test_evaluation_method_field_matches_similarity_path(monkeypatch):
    class Q:
        text = "What is normalization?"
        reference_answer = "Normalization reduces redundancy in relational tables."
        expected_concepts = ["normalization", "redundancy"]
        star_required = False
        category = "technical"

    monkeypatch.setattr(n, "_SEMANTIC_AVAILABLE", False)
    result = n.analyze_answer(Q(), "Normalization reduces redundancy in relational tables.")
    assert "TF-IDF fallback" in result["evaluationMethod"]
