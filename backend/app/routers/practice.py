import random

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Question
from ..security import get_current_user
from ..services.nlp_service import analyze_answer
from ..services.question_generation import select_questions

router = APIRouter()

class PracticeAnswer(BaseModel):
    questionId: int
    answer: str = Field(default="", max_length=12000)

@router.get("/question")
def practice_question(domain: str, difficulty: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    try:
        chosen = select_questions(db, user.id, domain, difficulty, 1)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    q = chosen[0]
    return {"questionId": q.id, "domain": q.domain, "difficulty": q.difficulty, "category": q.category, "text": q.text, "source": q.source}

@router.post("/evaluate")
def practice_evaluate(payload: PracticeAnswer, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.get(Question, payload.questionId)
    if not q:
        raise HTTPException(404, "Practice question not found")
    result = analyze_answer(q, payload.answer.strip())
    # Intentionally not persisted: practice answers do not create interview
    # sessions, answers, or reports, and never affect dashboard statistics.
    return {"question": q.text, "category": q.category, "analysis": result}
