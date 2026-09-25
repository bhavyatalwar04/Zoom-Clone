"""FastAPI dependencies shared by the routers."""

from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .errors import AppError
from .models import User

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(db: DbSession) -> User:
    """There is no login in this app: every request acts as the seeded default user."""
    email = get_settings().default_user_email
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        raise AppError(500, "DEFAULT_USER_MISSING", "The default user has not been seeded.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
