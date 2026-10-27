from pydantic import BaseModel, Field, EmailStr

class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
class LoginRequest(BaseModel):
    email: EmailStr
    password: str
class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
class AuthResponse(BaseModel):
    token: str
    user: UserOut
class StartInterviewRequest(BaseModel):
    domain: str
    difficulty: str
    questionCount: int = Field(default=5, ge=3, le=8)
class AnswerRequest(BaseModel):
    answer: str = Field(default="", max_length=12000)
    durationSeconds: float = Field(default=0, ge=0)
    wordCount: int = Field(default=0, ge=0)
    speechRate: float = Field(default=0, ge=0)
    pauseCount: int = Field(default=0, ge=0)
    confidenceScore: int = Field(default=0, ge=0, le=100)
    eyeContactScore: float = Field(default=0, ge=0, le=100)
    speechPaceScore: float = Field(default=0, ge=0, le=100)
    pauseControlScore: float = Field(default=0, ge=0, le=100)
    facePresenceScore: float = Field(default=0, ge=0, le=100)
    expressionEngagementScore: float = Field(default=0, ge=0, le=100)
class ReportOut(BaseModel):
    sessionId: int
    score: int
    subtitle: str
    domain: str
    difficulty: str
    skillCards: list[dict]
    confidenceAnalysis: dict
    answerAnalysis: dict
    strengths: list[str]
    weaknesses: list[str]
    recommendations: list[str]
