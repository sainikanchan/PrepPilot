from collections import Counter

from app.models import Question
from app.database import SessionLocal
from app.main import seed_questions
from app.services.question_bank import QUESTIONS

DOMAINS = {"software-engineering", "data-science", "product-management", "behavioral-hr"}
DIFFICULTIES = {"easy", "medium", "hard"}


def test_every_domain_difficulty_combination_has_at_least_three_questions():
    counts = Counter((q["domain"], q["difficulty"]) for q in QUESTIONS)
    for domain in DOMAINS:
        for difficulty in DIFFICULTIES:
            assert counts[(domain, difficulty)] >= 3, f"{domain}/{difficulty} has {counts[(domain, difficulty)]}"


def test_every_question_has_required_fields():
    for q in QUESTIONS:
        assert q["text"].strip()
        assert q["reference_answer"].strip()
        assert q["expected_concepts"], q["text"]
        assert q["category"] in {"technical", "behavioral"}
        assert q["difficulty"] in DIFFICULTIES


def test_behavioral_questions_carry_star_guidance():
    behavioral = [q for q in QUESTIONS if q["category"] == "behavioral"]
    assert any(q["star_required"] for q in behavioral)


def test_seed_adds_new_questions_without_duplicating_or_deleting():
    db = SessionLocal()
    before = db.query(Question).count()
    seed_questions()
    after_first = db.query(Question).count()
    seed_questions()
    after_second = db.query(Question).count()
    db.close()
    assert after_first >= before
    assert after_second == after_first


def test_seeded_database_covers_every_combination():
    db = SessionLocal()
    counts = Counter((row.domain, row.difficulty) for row in db.query(Question.domain, Question.difficulty))
    db.close()
    for domain in DOMAINS:
        for difficulty in DIFFICULTIES:
            assert counts[(domain, difficulty)] >= 3
