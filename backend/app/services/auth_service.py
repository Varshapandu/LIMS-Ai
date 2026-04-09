from __future__ import annotations

from datetime import UTC, datetime, timedelta

from jose import jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def build_access_token(email: str, role: str, full_name: str) -> str:
    payload = {
        "sub": email,
        "role": role,
        "full_name": full_name,
        "exp": datetime.now(UTC) + timedelta(hours=8),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def authenticate_user(db: Session, email: str, password: str) -> tuple[str, str, str] | None:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None
    if not pwd_context.verify(password, user.password_hash):
        return None
    role_code = user.role.code if user.role else "admin"
    return user.email, role_code, user.full_name
