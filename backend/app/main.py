from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from .database import Base, engine, SessionLocal
from .models import Question
from .services.question_bank import QUESTIONS
from .routers import auth, interviews, reports, profile, feedback, practice

Base.metadata.create_all(bind=engine)
if "adaptation_history" not in {column["name"] for column in inspect(engine).get_columns("interview_sessions")}:
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE interview_sessions ADD COLUMN adaptation_history JSON NOT NULL DEFAULT '[]'"))
if "profile_data" not in {column["name"] for column in inspect(engine).get_columns("users")}:
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users ADD COLUMN profile_data JSON NOT NULL DEFAULT '{}'"))
if "monitoring_events" not in {column["name"] for column in inspect(engine).get_columns("interview_sessions")}:
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE interview_sessions ADD COLUMN monitoring_events JSON NOT NULL DEFAULT '[]'"))
if "source" not in {column["name"] for column in inspect(engine).get_columns("questions")}:
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE questions ADD COLUMN source VARCHAR(30) NOT NULL DEFAULT 'question_bank'"))
if "evaluation_status" not in {column["name"] for column in inspect(engine).get_columns("interview_answers")}:
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE interview_answers ADD COLUMN evaluation_status VARCHAR(30) NOT NULL DEFAULT 'evaluated'"))
def seed_questions():
    """Idempotent seed: only add questions whose text is not already present.

    Existing questions and interview history are never deleted.
    """
    db = SessionLocal()
    try:
        existing = {q.text for q in db.query(Question.text).all()}
        additions = [Question(**q) for q in QUESTIONS if q["text"] not in existing]
        if additions:
            db.add_all(additions)
            db.commit()
    finally:
        db.close()

seed_questions()
app=FastAPI(title='PrepPilot API',version='2.0.0',description='AI-driven interactive interview training platform')
app.add_middleware(CORSMiddleware,allow_origins=['http://localhost:5173','http://127.0.0.1:5173'],allow_credentials=True,allow_methods=['*'],allow_headers=['*'])
app.include_router(auth.router,prefix='/api/auth',tags=['Auth'])
app.include_router(interviews.router,prefix='/api/interviews',tags=['Interviews'])
app.include_router(reports.router,prefix='/api/reports',tags=['Reports'])
app.include_router(profile.router,prefix='/api/profile',tags=['Profile'])
app.include_router(feedback.router,prefix='/api/feedback',tags=['Feedback'])
app.include_router(practice.router,prefix='/api/practice',tags=['Practice'])
@app.get('/health')
def health():
    return {'status': 'ok'}


@app.get('/')
def root(): return {'name':'PrepPilot API','status':'ok','docs':'/docs','features':['question bank','adaptive difficulty','NLP answer analysis','voice analysis','visual delivery analysis','reports']}
