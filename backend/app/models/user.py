from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base, UTCDateTime, utcnow

if TYPE_CHECKING:
    from .meeting import Meeting


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    avatar_color: Mapped[str] = mapped_column(String(7), default="#0B5CFF")
    job_title: Mapped[str | None] = mapped_column(String(120))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    # NULL for accounts that cannot sign in (e.g. contacts created by invites). See security.hash_password.
    password_hash: Mapped[str | None] = mapped_column(String(200))
    # 10 digit Personal Meeting ID; the matching personal room is a meeting with this code.
    personal_meeting_id: Mapped[str | None] = mapped_column(String(10), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    hosted_meetings: Mapped[list[Meeting]] = relationship(back_populates="host")
