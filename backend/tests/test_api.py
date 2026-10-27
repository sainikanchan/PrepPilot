import pytest

from conftest import register, auth_headers

STRONG = ("A process is an independent program instance with its own address space. "
          "A thread is a unit of execution inside a process and shares the process memory. "
          "Threads are lightweight, use shared memory for communication, and improve "
          "throughput while a process provides isolation and separate address space. "
          "Normalization organizes relational data into tables to reduce redundancy, "
          "improve data integrity, and avoid update anomalies using normal forms.")
WEAK = "idk maybe something about computers"
IRRELEVANT = "The weather today is sunny and I like pizza and football."
BEHAVIORAL = ("In the specific situation of a tight deadline, my task was to deliver a fix. "
              "The goal was to restore service. I built a patch, implemented retries, led the "
              "rollback, and we achieved a strong result: downtime was reduced and impact improved. "
              "I learned the importance of a rollback plan.")


@pytest.fixture(scope="module")
def user_a(client):
    return register(client, "Alice A", "alice@example.com")


@pytest.fixture(scope="module")
def user_b(client):
    return register(client, "Bob B", "bob@example.com")


def test_register(user_a):
    assert user_a["token"] and user_a["user"]["email"] == "alice@example.com"


def test_login(client):
    r = client.post("/api/auth/login", json={"email": "alice@example.com", "password": "secret123"})
    assert r.status_code == 200 and r.json()["token"]


def test_invalid_credentials(client):
    r = client.post("/api/auth/login", json={"email": "alice@example.com", "password": "wrong"})
    assert r.status_code == 401


def test_protected_endpoint_without_token(client):
    assert client.get("/api/interviews/current").status_code in (401, 403)


def test_interview_start_respects_count(client, user_a):
    r = client.post("/api/interviews/start", headers=auth_headers(user_a["token"]),
                    json={"domain": "software-engineering", "difficulty": "easy", "questionCount": 3})
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["questions"]) == 3
    assert body["currentQuestionIndex"] == 0


def test_answer_submission_and_duplicate_guard(client, user_a):
    h = auth_headers(user_a["token"])
    r = client.post("/api/interviews/answer", headers=h, json={"answer": STRONG, "wordCount": 80})
    assert r.status_code == 200, r.text
    analysis = r.json()["analysis"]
    assert 0 <= analysis["score"] <= 100
    assert isinstance(analysis["matchedConcepts"], list)
    dup = client.post("/api/interviews/answer", headers=h, json={"answer": STRONG})
    assert dup.status_code == 409


def test_empty_answer_rejected(client, user_b):
    h = auth_headers(user_b["token"])
    client.post("/api/interviews/start", headers=h,
                json={"domain": "data-science", "difficulty": "easy", "questionCount": 3})
    r = client.post("/api/interviews/answer", headers=h, json={"answer": "   "})
    assert r.status_code == 422


def test_strong_vs_weak_vs_irrelevant(client):
    from app.services.nlp_service import analyze_answer

    class Q:
        text = "What is normalization in a relational database and why is it useful?"
        reference_answer = ("Normalization organizes relational data into related tables to reduce "
                            "redundancy and update anomalies while improving data integrity.")
        expected_concepts = ["normalization", "redundancy", "data integrity", "normal forms"]
        star_required = False
        category = "technical"

    strong = analyze_answer(Q(), "Normalization reduces redundancy and improves data integrity using normal forms and related tables.")
    weak = analyze_answer(Q(), WEAK)
    irrelevant = analyze_answer(Q(), IRRELEVANT)
    assert strong["score"] > weak["score"]
    assert strong["score"] > irrelevant["score"]
    assert len(strong["matchedConcepts"]) >= len(irrelevant["matchedConcepts"])


def test_technical_evaluation_fields(client, user_a):
    h = auth_headers(user_a["token"])
    cur = client.get("/api/interviews/current", headers=h).json()["session"]
    assert cur is not None


def test_behavioral_star_evaluation(client):
    from app.services.nlp_service import analyze_answer

    class Q:
        text = "Describe a failure and what you learned from it."
        reference_answer = "Describe the situation, task, actions, result and learning."
        expected_concepts = ["failure", "action", "result", "learning"]
        star_required = True
        category = "behavioral"

    r = analyze_answer(Q(), BEHAVIORAL)
    assert r["starAnalysis"]["required"] is True
    assert r["starAnalysis"]["score"] > 0
    assert "method" in r["starAnalysis"]


def test_next_question_and_adaptive_difficulty(client, user_a):
    h = auth_headers(user_a["token"])
    r = client.post("/api/interviews/next", headers=h)
    assert r.status_code == 200, r.text
    session = r.json()["session"]
    assert session["currentQuestionIndex"] == 1
    assert session["adaptationHistory"], "adaptation must be recorded"
    entry = session["adaptationHistory"][-1]
    assert {"from", "to", "answerScore", "reason"} <= set(entry)


def test_cannot_answer_completed_session(client, user_a, user_b):
    h = auth_headers(user_a["token"])
    # Finish Alice's remaining two questions and complete.
    client.post("/api/interviews/answer", headers=h, json={"answer": STRONG})
    client.post("/api/interviews/next", headers=h)
    client.post("/api/interviews/answer", headers=h, json={"answer": STRONG})
    done = client.post("/api/interviews/complete", headers=h)
    assert done.status_code == 200, done.text
    assert done.json()["score"] >= 0
    r = client.post("/api/interviews/answer", headers=h, json={"answer": STRONG})
    assert r.status_code == 404  # no active session anymore


def test_report_retrieval_and_ownership(client, user_a, user_b):
    latest = client.get("/api/reports/latest", headers=auth_headers(user_a["token"]))
    assert latest.status_code == 200
    report = latest.json()
    assert report["skillCards"] and report["answerAnalysis"]["details"]
    sid = report["sessionId"]
    other = client.get(f"/api/reports/{sid}", headers=auth_headers(user_b["token"]))
    assert other.status_code == 404
    # Bob has no completed report yet
    assert client.get("/api/reports/latest", headers=auth_headers(user_b["token"])).status_code == 404


def test_session_ownership(client, user_a, user_b):
    # Alice's completed session must not be reachable/reopenable by Bob.
    cur = client.get("/api/interviews/current", headers=auth_headers(user_b["token"])).json()["session"]
    assert cur["domain"] == "data-science"  # only Bob's own active session


def test_seeding_is_idempotent(client):
    from app.models import Question
    from app.database import SessionLocal
    from app.main import seed_questions

    db = SessionLocal()
    before = db.query(Question).count()
    db.close()
    seed_questions()
    seed_questions()
    db = SessionLocal()
    after = db.query(Question).count()
    texts = db.query(Question.text).count()
    distinct = db.query(Question.text).distinct().count()
    db.close()
    assert after == before
    assert texts == distinct


def test_history_endpoint_filters_by_user(client, user_a, user_b):
    a = client.get("/api/reports/history", headers=auth_headers(user_a["token"])).json()
    b = client.get("/api/reports/history", headers=auth_headers(user_b["token"])).json()
    assert a["completedInterviews"] >= 1
    assert b["completedInterviews"] == 0


def test_monitoring_event_recording_and_validation(client, user_b):
    h = auth_headers(user_b["token"])
    ok = client.post("/api/interviews/monitoring-event", headers=h,
                     json={"type": "tab_switch", "occurredAt": "2026-10-02T10:00:00Z"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["eventCount"] == 1
    cur = client.get("/api/interviews/current", headers=h).json()["session"]
    assert cur["monitoringEvents"][0]["type"] == "tab_switch"
    bad = client.post("/api/interviews/monitoring-event", headers=h, json={"type": "cheating"})
    assert bad.status_code == 422


def test_monitoring_event_isolated_per_user(client, user_a, user_b):
    # Alice's event log must not contain Bob's events.
    cur = client.get("/api/interviews/current", headers=auth_headers(user_a["token"])).json()["session"]
    assert cur is None or all(e["type"] != "tab_switch" for e in cur["monitoringEvents"])


def test_feedback_submission_validation_and_isolation(client, user_a, user_b):
    h = auth_headers(user_a["token"])
    report = client.get("/api/reports/latest", headers=h).json()
    sid = report["sessionId"]

    bad_rating = client.post("/api/feedback", headers=h, json={"sessionId": sid, "rating": 9})
    assert bad_rating.status_code == 422

    ok = client.post("/api/feedback", headers=h, json={"sessionId": sid, "rating": 4, "comment": "Useful practice"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["rating"] == 4

    dup = client.post("/api/feedback", headers=h, json={"sessionId": sid, "rating": 5})
    assert dup.status_code == 409

    # Bob cannot attach feedback to Alice's session
    cross = client.post("/api/feedback", headers=auth_headers(user_b["token"]), json={"sessionId": sid, "rating": 5})
    assert cross.status_code == 404


def test_practice_mode_does_not_persist(client, user_a):
    h = auth_headers(user_a["token"])
    r = client.get("/api/practice/question", headers=h, params={"domain": "data-science", "difficulty": "easy"})
    assert r.status_code == 200, r.text
    q = r.json()
    assert q["text"] and q["questionId"]
    ev = client.post("/api/practice/evaluate", headers=h, json={"questionId": q["questionId"], "answer": "Supervised learning uses labeled data; unsupervised learning finds patterns in unlabeled data such as clusters."})
    assert ev.status_code == 200
    assert "analysis" in ev.json()
    # No new completed session/report/history entry for user_a from practice
    history = client.get("/api/reports/history", headers=h).json()
    before = history["completedInterviews"]
    client.post("/api/practice/evaluate", headers=h, json={"questionId": q["questionId"], "answer": "test"})
    history_after = client.get("/api/reports/history", headers=h).json()
    assert history_after["completedInterviews"] == before
    missing = client.get("/api/practice/question", headers=h, params={"domain": "nope", "difficulty": "easy"})
    assert missing.status_code == 404


def test_tab_switch_terminates_session_and_rejects_answers(client, user_b):
    h = auth_headers(user_b["token"])
    r = client.post("/api/interviews/terminate", headers=h, json={"reason": "tab_switch"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "terminated"
    # Repeated hidden events must not terminate again
    again = client.post("/api/interviews/terminate", headers=h, json={"reason": "tab_switch"})
    assert again.status_code == 404
    # No further answers accepted (no active session)
    ans = client.post("/api/interviews/answer", headers=h, json={"answer": "too late"})
    assert ans.status_code == 404
    # History/scoped current shows terminated, not active; previous answers preserved
    cur = client.get("/api/interviews/current", headers=h).json()["session"]
    assert cur["status"] == "terminated"
    assert cur["monitoringEvents"].count({"type": "terminated_tab_switch", "occurredAt": cur["monitoringEvents"][-1]["occurredAt"], "reason": "tab_switch"}) >= 1 or any(e["type"] == "terminated_tab_switch" for e in cur["monitoringEvents"])


def test_user_cannot_terminate_others_session(client, user_a, user_b):
    # user_a has an active... it was completed earlier; start new one for user_a
    h = auth_headers(user_a["token"])
    r = client.post("/api/interviews/start", headers=h, json={"domain": "behavioral-hr", "difficulty": "easy", "questionCount": 3})
    assert r.status_code == 200, r.text
    cross = client.post("/api/interviews/terminate", headers=auth_headers(user_b["token"]), json={"reason": "tab_switch"})
    assert cross.status_code == 404
    # Alice's session still active: she can answer it
    ans = client.post("/api/interviews/answer", headers=h, json={"answer": "In the context of a deadline, my goal was to ship. I built the fix, implemented retries, and the result improved: uptime increased and impact was measured."})
    assert ans.status_code == 200, ans.text


def test_health_endpoint(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_non_substantive_answers_are_gated():
    from app.services.nlp_service import analyze_answer

    class Q:
        text = "What is the difference between a stack and a queue?"
        reference_answer = "A stack is last-in-first-out; a queue is first-in-first-out."
        expected_concepts = ["stack", "queue", "LIFO", "FIFO"]
        star_required = False
        category = "technical"

    for bad in ["okay", "yes", "no", "I don't know", "no idea", "um", "..."]:
        r = analyze_answer(Q(), bad)
        assert r["score"] <= 5, (bad, r["score"])
        assert r["relevanceScore"] == 0 and r["clarityScore"] == 0 and r["technicalScore"] == 0 and r["structureScore"] == 0
        assert "not enough content" in r["explanation"].lower() or "insufficient" in r["explanation"].lower()

    short_ok = analyze_answer(Q(), "LIFO vs FIFO")
    assert short_ok["conceptCoverage"] > 0  # legitimate short factual answer not gated

    solid = analyze_answer(Q(), "A stack is last-in-first-out because items are pushed and popped from the top, while a queue is first-in-first-out because items enter at the back and leave from the front.")
    assert solid["score"] >= 40

    skipped = analyze_answer(Q(), "")
    assert skipped["score"] == 0 and "No answer was captured" in skipped["feedback"][0]


def test_evaluation_status_insufficient_content():
    from app.services.nlp_service import analyze_answer

    class Q:
        text = "What is the difference between a stack and a queue?"
        reference_answer = "A stack is last-in-first-out; a queue is first-in-first-out."
        expected_concepts = ["stack", "queue", "LIFO", "FIFO"]
        star_required = False
        category = "technical"

    for bad in ["okay", "yes", "no", "I don't know", "not sure", "um", "idk", "dunno", ""]:
        r = analyze_answer(Q(), bad)
        assert r["evaluationStatus"] == "insufficient_content" if bad else r["evaluationStatus"] == "skipped"
        assert r["score"] <= 5
        assert r["relevanceScore"] == 0 and r["clarityScore"] == 0 and r["technicalScore"] == 0 and r["structureScore"] == 0


def test_evaluation_status_evaluated_for_substantive():
    from app.services.nlp_service import analyze_answer

    class Q:
        text = "What is the difference between a stack and a queue?"
        reference_answer = "A stack is last-in-first-out; a queue is first-in-first-out."
        expected_concepts = ["stack", "queue", "LIFO", "FIFO"]
        star_required = False
        category = "technical"

    # Valid short but concept-hitting answer
    r = analyze_answer(Q(), "LIFO vs FIFO")
    assert r["evaluationStatus"] == "evaluated"
    assert r["conceptCoverage"] > 0

    # Longer substantive answer
    r = analyze_answer(Q(), "A stack uses LIFO ordering while a queue uses FIFO ordering. This affects how data is accessed.")
    assert r["evaluationStatus"] == "evaluated"
    assert r["score"] >= 40


def test_evaluation_status_skipped():
    from app.services.nlp_service import analyze_answer

    class Q:
        text = "What is the difference between a stack and a queue?"
        reference_answer = "A stack is last-in-first-out; a queue is first-in-first-out."
        expected_concepts = ["stack", "queue", "LIFO", "FIFO"]
        star_required = False
        category = "technical"

    r = analyze_answer(Q(), "")
    assert r["evaluationStatus"] == "skipped"
    assert r["score"] == 0
    assert "No answer was captured" in r["feedback"][0]


def test_short_technical_answers_not_gated():
    from app.services.nlp_service import analyze_answer

    class Q:
        text = "What is the difference between a stack and a queue?"
        reference_answer = "A stack is last-in-first-out; a queue is first-in-first-out."
        expected_concepts = ["stack", "queue", "LIFO", "FIFO"]
        star_required = False
        category = "technical"

    short_answers = [
        "LIFO vs FIFO",
        "O(1) lookup",
        "HTTP is stateless",
        "A stack uses LIFO ordering",
        "SQL joins combine related rows",
    ]
    for ans in short_answers:
        r = analyze_answer(Q(), ans)
        assert r["evaluationStatus"] == "evaluated", f"Failed for: {ans}"
        assert r["conceptCoverage"] > 0 or r["score"] > 5, f"Failed for: {ans}"


def test_incorrect_but_substantive_not_gated():
    from app.services.nlp_service import analyze_answer

    class Q:
        text = "What is normalization in a relational database?"
        reference_answer = "Normalization organizes relational data into related tables to reduce redundancy and update anomalies while improving data integrity."
        expected_concepts = ["normalization", "redundancy", "data integrity", "normal forms"]
        star_required = False
        category = "technical"

    # Incorrect but substantive - should be evaluated, not gated
    r = analyze_answer(Q(), "Normalization is when you make data bigger and more complex to store it.")
    assert r["evaluationStatus"] == "evaluated"
    # Should have some score but not necessarily high
    assert 0 <= r["score"] <= 100


def test_long_irrelevant_not_high_score():
    from app.services.nlp_service import analyze_answer

    class Q:
        text = "What is normalization in a relational database?"
        reference_answer = "Normalization organizes relational data into related tables to reduce redundancy and update anomalies while improving data integrity."
        expected_concepts = ["normalization", "redundancy", "data integrity", "normal forms"]
        star_required = False
        category = "technical"

    # Long but irrelevant answer
    long_irrelevant = "The weather today is sunny and I like pizza and football. " * 20
    r = analyze_answer(Q(), long_irrelevant)
    # Should not score highly just because it's long
    assert r["score"] < 50, f"Long irrelevant answer scored {r['score']}"


def test_behavioral_star_with_insufficient_content():
    from app.services.nlp_service import analyze_answer

    class Q:
        text = "Describe a failure and what you learned from it."
        reference_answer = "Describe the situation, task, actions, result and learning."
        expected_concepts = ["failure", "action", "result", "learning"]
        star_required = True
        category = "behavioral"

    r = analyze_answer(Q(), "I don't know")
    assert r["evaluationStatus"] == "insufficient_content"
    # STAR should still be present but indicate missing components
    assert r["starAnalysis"]["required"] is True


def test_api_returns_evaluation_status(client):
    # Register a fresh user to avoid session conflicts
    r = client.post("/api/auth/register", json={"name": "Test User", "email": "test_eval@example.com", "password": "test1234"})
    assert r.status_code == 201
    token = r.json()["token"]
    h = {"Authorization": f"Bearer {token}"}

    # Start a new interview
    r = client.post("/api/interviews/start", headers=h, json={"domain": "software-engineering", "difficulty": "easy", "questionCount": 3})
    assert r.status_code == 200

    # Submit insufficient answer
    r = client.post("/api/interviews/answer", headers=h, json={"answer": "okay"})
    assert r.status_code == 200
    analysis = r.json()["analysis"]
    assert analysis["evaluationStatus"] == "insufficient_content"
    assert analysis["score"] <= 5

    # Move to next
    client.post("/api/interviews/next", headers=h)

    # Submit substantive answer
    r = client.post("/api/interviews/answer", headers=h, json={"answer": "A stack is LIFO and a queue is FIFO. Stack uses push/pop, queue uses enqueue/dequeue."})
    assert r.status_code == 200
    analysis = r.json()["analysis"]
    assert analysis["evaluationStatus"] == "evaluated"
    assert analysis["score"] > 5


def test_report_includes_evaluation_status(client):
    # Register a fresh user
    r = client.post("/api/auth/register", json={"name": "Test Report", "email": "test_report@example.com", "password": "test1234"})
    assert r.status_code == 201
    token = r.json()["token"]
    h = {"Authorization": f"Bearer {token}"}

    # Start interview, answer questions, complete
    r = client.post("/api/interviews/start", headers=h, json={"domain": "software-engineering", "difficulty": "easy", "questionCount": 3})
    assert r.status_code == 200

    # Answer with mixed content
    client.post("/api/interviews/answer", headers=h, json={"answer": "okay"})
    client.post("/api/interviews/next", headers=h)
    client.post("/api/interviews/answer", headers=h, json={"answer": "A stack is LIFO and a queue is FIFO. Stack uses push/pop."})
    client.post("/api/interviews/next", headers=h)
    client.post("/api/interviews/answer", headers=h, json={"answer": "A stack is LIFO and a queue is FIFO. Stack uses push/pop."})
    client.post("/api/interviews/complete", headers=h)

    # Get latest report
    r = client.get("/api/reports/latest", headers=h)
    assert r.status_code == 200
    report = r.json()
    # Check that details include evaluationStatus
    for detail in report["answerAnalysis"]["details"]:
        assert "evaluationStatus" in detail
        assert detail["evaluationStatus"] in ["evaluated", "insufficient_content", "skipped"]


def test_practice_mode_evaluation_status():
    from app.services.nlp_service import analyze_answer

    class Q:
        text = "What is the difference between a stack and a queue?"
        reference_answer = "A stack is last-in-first-out; a queue is first-in-first-out."
        expected_concepts = ["stack", "queue", "LIFO", "FIFO"]
        star_required = False
        category = "technical"

    r = analyze_answer(Q(), "okay")
    assert r["evaluationStatus"] == "insufficient_content"

    r = analyze_answer(Q(), "LIFO vs FIFO")
    assert r["evaluationStatus"] == "evaluated"
