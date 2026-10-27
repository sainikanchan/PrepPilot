from datetime import datetime
from sqlalchemy import String, Integer, Float, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    profile_data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    sessions = relationship("InterviewSession", back_populates="user", cascade="all, delete-orphan")

class Question(Base):
    __tablename__ = "questions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    domain: Mapped[str] = mapped_column(String(80), index=True)
    difficulty: Mapped[str] = mapped_column(String(20), index=True)
    category: Mapped[str] = mapped_column(String(50), default="technical")
    text: Mapped[str] = mapped_column(Text)
    reference_answer: Mapped[str] = mapped_column(Text)
    expected_concepts: Mapped[list] = mapped_column(JSON, default=list)
    star_required: Mapped[bool] = mapped_column(default=False)
    source: Mapped[str] = mapped_column(String(30), default="question_bank")

class InterviewSession(Base):
    __tablename__ = "interview_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    domain: Mapped[str] = mapped_column(String(80))
    difficulty: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="active")
    current_question_index: Mapped[int] = mapped_column(Integer, default=0)
    question_ids: Mapped[list] = mapped_column(JSON, default=list)
    adaptation_history: Mapped[list] = mapped_column(JSON, default=list)
    monitoring_events: Mapped[list] = mapped_column(JSON, default=list)
    score: Mapped[int] = mapped_column(Integer, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    user = relationship("User", back_populates="sessions")
    answers = relationship("InterviewAnswer", back_populates="session", cascade="all, delete-orphan")

class InterviewAnswer(Base):
    __tablename__ = "interview_answers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id"))
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"))
    answer: Mapped[str] = mapped_column(Text, default="")
    score: Mapped[int] = mapped_column(Integer, default=0)
    relevance_score: Mapped[float] = mapped_column(Float, default=0)
    technical_score: Mapped[float] = mapped_column(Float, default=0)
    clarity_score: Mapped[float] = mapped_column(Float, default=0)
    structure_score: Mapped[float] = mapped_column(Float, default=0)
    concept_coverage: Mapped[float] = mapped_column(Float, default=0)
    semantic_similarity: Mapped[float] = mapped_column(Float, default=0)
    missing_concepts: Mapped[list] = mapped_column(JSON, default=list)
    matched_concepts: Mapped[list] = mapped_column(JSON, default=list)
    feedback: Mapped[list] = mapped_column(JSON, default=list)
    star_analysis: Mapped[dict] = mapped_column(JSON, default=dict)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0)
    word_count: Mapped[int] = mapped_column(Integer, default=0)
    speech_rate: Mapped[float] = mapped_column(Float, default=0)
    pause_count: Mapped[int] = mapped_column(Integer, default=0)
    confidence_score: Mapped[int] = mapped_column(Integer, default=0)
    eye_contact_score: Mapped[float] = mapped_column(Float, default=0)
    speech_pace_score: Mapped[float] = mapped_column(Float, default=0)
    pause_control_score: Mapped[float] = mapped_column(Float, default=0)
    face_presence_score: Mapped[float] = mapped_column(Float, default=0)
    expression_engagement_score: Mapped[float] = mapped_column(Float, default=0)
    evaluation_status: Mapped[str] = mapped_column(String(30), default="evaluated")
    session = relationship("InterviewSession", back_populates="answers")
    question = relationship("Question")

class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id"), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
