from fastapi import APIRouter
from sqlalchemy import select

from ..deps import CurrentUser, DbSession
from ..models import User
from ..schemas import UserOut

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def get_me(user: CurrentUser):
    return user


@router.get("", response_model=list[UserOut])
def list_contacts(db: DbSession, user: CurrentUser):
    """Everyone except the current user, used as the contact list / invitee suggestions."""
    return db.scalars(select(User).where(User.id != user.id).order_by(User.full_name)).all()
