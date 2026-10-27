from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import InterviewAnswer, InterviewSession, Question
from ..schemas import AnswerRequest, StartInterviewRequest
from ..security import get_current_user
from ..services.nlp_service import analyze_answer
from ..services.question_generation import select_questions

router = APIRouter()
DIFFICULTIES = ("easy", "medium", "hard")
STRONG_SCORE_THRESHOLD = 80
WEAK_SCORE_THRESHOLD = 50
# Rule-based adaptation thresholds; tweak these constants to tune session behavior.


def session_view(session, db):
    questions = [db.get(Question, qid) for qid in session.question_ids or []]
    return {
        "sessionId": session.id, "domain": session.domain,
        "difficulty": session.difficulty, "status": session.status,
        "currentQuestionIndex": session.current_question_index,
        "timerSeconds": 90, "questions": [q.text for q in questions if q],
        "questionDifficulties": [q.difficulty for q in questions if q],
        "adaptationHistory": session.adaptation_history or [],
        "monitoringEvents": session.monitoring_events or [],
    }


MONITORING_EVENT_TYPES = {"tab_switch", "face_missing", "face_restored", "camera_error", "terminated_tab_switch"}


def active_session(db, user):
    return db.query(InterviewSession).filter(
        InterviewSession.user_id == user.id,
        InterviewSession.status == "active",
    ).order_by(InterviewSession.id.desc()).first()


@router.post("/start")
def start(payload: StartInterviewRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if payload.difficulty not in DIFFICULTIES:
        raise HTTPException(422, "Difficulty must be easy, medium, or hard")
    if active_session(db, user):
        raise HTTPException(409, "You already have an active interview. Continue or exit it first.")
    try:
        chosen = select_questions(db, user.id, payload.domain, payload.difficulty, payload.questionCount)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    session = InterviewSession(user_id=user.id, domain=payload.domain, difficulty=payload.difficulty,
                               question_ids=[q.id for q in chosen], adaptation_history=[], monitoring_events=[])
    db.add(session); db.commit(); db.refresh(session)
    return session_view(session, db)


@router.get("/current")
def current(db: Session = Depends(get_db), user=Depends(get_current_user)):
    session = active_session(db, user)
    if session:
        return {"session": session_view(session, db)}
    terminated = db.query(InterviewSession).filter(
        InterviewSession.user_id == user.id,
        InterviewSession.status == "terminated",
    ).order_by(InterviewSession.id.desc()).first()
    return {"session": session_view(terminated, db) if terminated else None}


@router.post("/monitoring-event")
def monitoring_event(payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    event_type = payload.get("type")
    if event_type not in MONITORING_EVENT_TYPES:
        raise HTTPException(422, f"type must be one of {sorted(MONITORING_EVENT_TYPES)}")
    session = active_session(db, user)
    if not session:
        raise HTTPException(404, "No active interview")
    events = list(session.monitoring_events or [])
    events.append({
        "type": event_type,
        "occurredAt": payload.get("occurredAt") or datetime.utcnow().isoformat() + "Z",
    })
    session.monitoring_events = events
    db.commit()
    return {"recorded": True, "eventCount": len(events), "monitoringEvents": events}


@router.post("/answer")
def answer(payload: AnswerRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    session = active_session(db, user)
    if not session:
        raise HTTPException(404, "No active interview")
    if session.current_question_index >= len(session.question_ids):
        raise HTTPException(409, "Interview has no unanswered question")
    if db.query(InterviewAnswer).filter_by(session_id=session.id, question_id=session.question_ids[session.current_question_index]).first():
        raise HTTPException(409, "This question has already been answered")
    if not payload.answer.strip():
        raise HTTPException(422, "Please provide an answer before continuing")
    question = db.get(Question, session.question_ids[session.current_question_index])
    result = analyze_answer(question, payload.answer)
    answer_row = InterviewAnswer(
        session_id=session.id, question_id=question.id, answer=payload.answer.strip(),
        score=result["score"], relevance_score=result["relevanceScore"],
        technical_score=result["technicalScore"], clarity_score=result["clarityScore"],
        structure_score=result["structureScore"], concept_coverage=result["conceptCoverage"],
        semantic_similarity=result["referenceSimilarity"], missing_concepts=result["missingConcepts"],
        matched_concepts=result["matchedConcepts"], feedback=result["feedback"], star_analysis=result["starAnalysis"],
        duration_seconds=payload.durationSeconds, word_count=payload.wordCount,
        speech_rate=payload.speechRate, pause_count=payload.pauseCount,
        confidence_score=payload.confidenceScore, eye_contact_score=payload.eyeContactScore,
        speech_pace_score=payload.speechPaceScore, pause_control_score=payload.pauseControlScore,
        face_presence_score=payload.facePresenceScore, expression_engagement_score=payload.expressionEngagementScore,
        evaluation_status=result.get("evaluationStatus", "evaluated"),
    )
    db.add(answer_row); db.commit(); db.refresh(answer_row)
    return {"answerId": answer_row.id, "analysis": result}


@router.post("/skip")
def skip_question(db: Session = Depends(get_db), user=Depends(get_current_user)):
    session = active_session(db, user)
    if not session or session.current_question_index >= len(session.question_ids):
        raise HTTPException(404, "No active question to skip")
    question = db.get(Question, session.question_ids[session.current_question_index])
    if db.query(InterviewAnswer).filter_by(session_id=session.id, question_id=question.id).first():
        raise HTTPException(409, "This question has already been answered")
    result = analyze_answer(question, "")
    db.add(InterviewAnswer(session_id=session.id, question_id=question.id, answer="", score=0,
        relevance_score=0, technical_score=0, clarity_score=0, structure_score=0,
        concept_coverage=0, semantic_similarity=0, missing_concepts=result["missingConcepts"],
        matched_concepts=[], feedback=result["feedback"], star_analysis=result["starAnalysis"],
        evaluation_status=result.get("evaluationStatus", "skipped")))
    db.commit()
    return {"status": "skipped", "analysis": result}


@router.post("/next")
def next_question(db: Session = Depends(get_db), user=Depends(get_current_user)):
    session = active_session(db, user)
    if not session:
        raise HTTPException(404, "No active interview")
    index = session.current_question_index
    if index >= len(session.question_ids) - 1:
        raise HTTPException(409, "This is the final question; complete the interview")
    current_id = session.question_ids[index]
    current_q = db.get(Question, current_id)
    last = db.query(InterviewAnswer).filter_by(session_id=session.id, question_id=current_id).first()
    if not last:
        raise HTTPException(409, "Answer the current question before moving on")
    previous_difficulty = current_q.difficulty
    target = previous_difficulty
    reason = "Average answer: keep the same difficulty."
    if last.score >= STRONG_SCORE_THRESHOLD:
        target = DIFFICULTIES[min(2, DIFFICULTIES.index(previous_difficulty) + 1)]
        reason = "Strong answer (80+): increase difficulty where a distinct question is available."
    elif last.score < WEAK_SCORE_THRESHOLD:
        target = DIFFICULTIES[max(0, DIFFICULTIES.index(previous_difficulty) - 1)]
        reason = "Developing answer (below 50): decrease difficulty where a distinct question is available."
    next_id = session.question_ids[index + 1]
    reserved = set(session.question_ids)
    reserved.discard(next_id)
    reserved_texts = {db.get(Question, question_id).text for question_id in reserved if db.get(Question, question_id)}
    pool = db.query(Question).filter(Question.domain == session.domain, Question.difficulty == target).order_by(Question.id).all()
    replacement = next((q for q in pool if q.id not in reserved and q.text not in reserved_texts and q.text != current_q.text), None)
    if not replacement:
        replacement = db.get(Question, next_id)
        target = replacement.difficulty
        reason += " No unused question at the target level; retained the already selected next question."
    if not replacement:
        raise HTTPException(409, "No unused questions remain in this domain")
    session.question_ids[index + 1] = replacement.id
    history = list(session.adaptation_history or [])
    history.append({"afterQuestion": index + 1, "from": previous_difficulty, "to": replacement.difficulty, "answerScore": last.score, "reason": reason})
    session.adaptation_history = history
    session.current_question_index += 1
    db.commit()
    return {"session": session_view(session, db)}


@router.post("/complete")
def complete(db: Session = Depends(get_db), user=Depends(get_current_user)):
    session = active_session(db, user)
    if not session:
        raise HTTPException(404, "No active interview")
    if session.current_question_index != len(session.question_ids) - 1:
        raise HTTPException(409, "Answer all selected questions before completing the interview")
    final_qid = session.question_ids[-1]
    if not db.query(InterviewAnswer).filter_by(session_id=session.id, question_id=final_qid).first():
        raise HTTPException(409, "Answer the final question before completing the interview")
    answers = session.answers
    session.score = round(sum(a.score for a in answers) / len(answers)) if answers else 0
    session.status = "completed"; session.completed_at = datetime.utcnow(); db.commit()
    from ..services.report_service import build_report
    return build_report(session)


@router.post("/terminate")
def terminate(payload: dict | None = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    session = active_session(db, user)
    if not session:
        raise HTTPException(404, "No active interview to terminate")
    reason = (payload or {}).get("reason", "tab_switch")
    if reason not in {"tab_switch"}:
        raise HTTPException(422, "Unsupported termination reason")
    events = list(session.monitoring_events or [])
    events.append({"type": "terminated_tab_switch", "occurredAt": datetime.utcnow().isoformat() + "Z", "reason": reason})
    session.monitoring_events = events
    session.status = "terminated"
    db.commit()
    return {"status": session.status, "reason": reason}


@router.post("/exit")
def exit_interview(db: Session = Depends(get_db), user=Depends(get_current_user)):
    session = active_session(db, user)
    if not session:
        raise HTTPException(404, "No active interview")
    session.status = "abandoned"; db.commit()
    return {"status": session.status}
