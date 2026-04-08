from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.contracts import LoginRequest, LoginResponse
from app.db.session import get_db
from app.services.auth_service import authenticate_user, build_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    authenticated = authenticate_user(db, payload.email, payload.password)
    if not authenticated:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    email, role, full_name = authenticated
    token = build_access_token(email, role, full_name)
    return LoginResponse(access_token=token, role=role, full_name=full_name)
