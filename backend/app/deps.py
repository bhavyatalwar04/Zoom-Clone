"""FastAPI dependencies shared by the routers."""

from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .errors import AppError
from .models import User
from .security import verify_session_token

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(db: DbSession, authorization: Annotated[str | None, Header()] = None) -> User:
    """The signed-in user (`Authorization: Bearer <token>`), or the seeded demo user.

    Signing in is optional: as the assignment allows, anyone who hasn't signed in acts as the
    default user. A token that is present but invalid or expired is an error, so the client
    can drop it and ask the person to sign in again.
    """
    if authorization:
        scheme, _, token = authorization.partition(" ")
        user_id = verify_session_token(token.strip()) if scheme.lower() == "bearer" else None
        user = db.get(User, user_id) if user_id is not None else None
        if user is None:
            raise AppError(401, "SESSION_EXPIRED", "Your session has expired. Please sign in again.")
        return user
    email = get_settings().default_user_email
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        raise AppError(500, "DEFAULT_USER_MISSING", "The default user has not been seeded.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
