from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base, UTCDateTime, utcnow
from .base import db_enum

if TYPE_CHECKING:
    from .meeting import Meeting
    from .user import User


class ParticipantRole(str, enum.Enum):
    HOST = "host"
    CO_HOST = "co_host"
    ATTENDEE = "attendee"


class MeetingParticipant(Base):
    """One attendance of a meeting (a join -> leave session).

    Created every time someone joins and closed (`left_at`) when they leave, which gives the
    meeting history for "Recent meetings". Chat, transcript, activity, poll votes and recordings
    all hang off the participant who produced them.
    """

    __tablename__ = "meeting_participants"
    __table_args__ = (Index("ix_participants_meeting_left", "meeting_id", "left_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    # NULL for guests who joined through an invite link without an account.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    display_name: Mapped[str] = mapped_column(String(80))
    role: Mapped[ParticipantRole] = mapped_column(
        db_enum(ParticipantRole, "participant_role"), default=ParticipantRole.ATTENDEE
    )
    joined_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    left_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    was_removed: Mapped[bool] = mapped_column(Boolean, default=False)
    # Accumulated while this person's microphone detected speech (reported by their client).
    talk_time_ms: Mapped[int] = mapped_column(Integer, default=0)

    meeting: Mapped[Meeting] = relationship(back_populates="participants")
    user: Mapped[User | None] = relationship()
