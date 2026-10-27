from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import InterviewSession
from ..security import get_current_user
from ..services.report_service import build_report
router=APIRouter()
@router.get('/history')
def history(db:Session=Depends(get_db),u=Depends(get_current_user)):
    sessions=db.query(InterviewSession).filter(InterviewSession.user_id==u.id,InterviewSession.status=='completed').order_by(InterviewSession.completed_at.desc()).all()
    scores=[s.score for s in sessions]
    recent_item = lambda s: {'sessionId':s.id,'score':s.score,'domain':s.domain,'difficulty':s.difficulty,'questionCount':len(s.question_ids or []),'completedAt':s.completed_at.isoformat() if s.completed_at else None}
    return {'completedInterviews':len(sessions),'averageScore':round(sum(scores)/len(scores)) if scores else None,'recent': [recent_item(s) for s in sessions[:5]],'all': [recent_item(s) for s in sessions]}
@router.get('/latest')
def latest(db:Session=Depends(get_db),u=Depends(get_current_user)):
    s=db.query(InterviewSession).filter(InterviewSession.user_id==u.id,InterviewSession.status=='completed').order_by(InterviewSession.completed_at.desc()).first()
    if not s: raise HTTPException(404,'No completed interview report found')
    return build_report(s)
@router.get('/{session_id}')
def report(session_id:int,db:Session=Depends(get_db),u=Depends(get_current_user)):
    s=db.get(InterviewSession,session_id)
    if not s or s.user_id!=u.id: raise HTTPException(404,'Interview report not found')
    return build_report(s)
