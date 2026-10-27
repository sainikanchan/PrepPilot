from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from ..security import get_current_user
from ..database import get_db
from sqlalchemy.orm import Session

router = APIRouter()

class ProfileUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    role: str = Field(default="", max_length=120)
    location: str = Field(default="", max_length=120)
    bio: str = Field(default="", max_length=2000)
    resume: str = Field(default="", max_length=255)

@router.get("")
def profile(user=Depends(get_current_user)):
    return {"id": user.id, "name": user.name, "email": user.email, **(user.profile_data or {})}

@router.put("")
def update_profile(payload: ProfileUpdate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    user.name = payload.name.strip()
    user.profile_data = payload.model_dump(exclude={"name"})
    db.commit(); db.refresh(user)
    return {"id": user.id, "name": user.name, "email": user.email, **(user.profile_data or {})}
