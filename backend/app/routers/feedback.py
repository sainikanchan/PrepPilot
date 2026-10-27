from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Feedback, InterviewSession
from ..security import get_current_user

router = APIRouter()

class FeedbackRequest(BaseModel):
    sessionId: int
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)

@router.post("")
def submit_feedback(payload: FeedbackRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    session = db.get(InterviewSession, payload.sessionId)
    if not session or session.user_id != user.id:
        raise HTTPException(404, "Interview session not found")
    if session.status != "completed":
        raise HTTPException(409, "Feedback can only be submitted for a completed interview")
    if db.query(Feedback).filter_by(session_id=session.id, user_id=user.id).first():
        raise HTTPException(409, "Feedback already submitted for this interview")
    row = Feedback(user_id=user.id, session_id=session.id, rating=payload.rating, comment=payload.comment.strip())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"feedbackId": row.id, "rating": row.rating, "comment": row.comment}
