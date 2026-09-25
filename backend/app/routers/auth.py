"""Optional sign-in. Without a token every request acts as the demo user (see deps.get_current_user)."""

from fastapi import APIRouter, status
from sqlalchemy import exists, select

from ..deps import DbSession
from ..errors import AppError
from ..models import User
from ..schemas import AuthResponse, LoginRequest, SignupRequest, UserOut
from ..security import create_session_token, hash_password, verify_password
from ..services.meetings import get_or_create_personal_room

router = APIRouter(prefix="/api/auth", tags=["auth"])

AVATAR_COLORS = ["#0B5CFF", "#E8710A", "#12A150", "#9334E6", "#D93025", "#0E7490", "#B45309"]


def _session(user: User) -> AuthResponse:
    return AuthResponse(token=create_session_token(user.id), user=UserOut.model_validate(user))


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(data: SignupRequest, db: DbSession):
    if db.scalar(select(exists().where(User.email == data.email))):
        raise AppError(409, "EMAIL_TAKEN", "An account with this email already exists. Please sign in.")
    user = User(
        full_name=data.full_name,
        email=data.email,
        password_hash=hash_password(data.password),
        avatar_color=AVATAR_COLORS[sum(map(ord, data.email)) % len(AVATAR_COLORS)],
    )
    db.add(user)
    db.commit()
    get_or_create_personal_room(db, user)  # every account gets a Personal Meeting ID
    return _session(user)


@router.post("/login", response_model=AuthResponse)
def login(data: LoginRequest, db: DbSession):
    user = db.scalar(select(User).where(User.email == data.email.strip().lower()))
    if user is None or not verify_password(data.password, user.password_hash):
        raise AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password.")
    return _session(user)
