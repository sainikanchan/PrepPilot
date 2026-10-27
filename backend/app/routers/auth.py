from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User
from ..schemas import AuthResponse, LoginRequest, RegisterRequest, UserOut
from ..security import create_access_token, get_current_user, hash_password, verify_password
router=APIRouter()
def user_out(u): return UserOut(id=u.id,name=u.name,email=u.email)
@router.post('/register',response_model=AuthResponse,status_code=201)
def register(p:RegisterRequest,db:Session=Depends(get_db)):
    if db.query(User).filter(User.email==p.email.lower()).first(): raise HTTPException(409,'Email already registered')
    u=User(name=p.name.strip(),email=p.email.lower(),password_hash=hash_password(p.password)); db.add(u); db.commit(); db.refresh(u)
    return {'token':create_access_token(u.id),'user':user_out(u)}
@router.post('/login',response_model=AuthResponse)
def login(p:LoginRequest,db:Session=Depends(get_db)):
    u=db.query(User).filter(User.email==p.email.lower()).first()
    if not u or not verify_password(p.password,u.password_hash): raise HTTPException(401,'Invalid email or password')
    return {'token':create_access_token(u.id),'user':user_out(u)}
@router.get('/me',response_model=UserOut)
def me(u=Depends(get_current_user)): return user_out(u)
