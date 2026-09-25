from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base, UTCDateTime, utcnow
from .base import db_enum

if TYPE_CHECKING:
    from .engagement import ChatMessage, TranscriptSegment
    from .participant import MeetingParticipant
    from .user import User


class MeetingType(str, enum.Enum):
    INSTANT = "instant"
    SCHEDULED = "scheduled"


class MeetingStatus(str, enum.Enum):
    SCHEDULED = "scheduled"  # created, host has not started it yet
    LIVE = "live"  # someone is currently in the meeting
    ENDED = "ended"  # the meeting took place and is now over


class Meeting(Base):
    """The thing you schedule or start: it owns the Meeting ID, passcode and settings."""

    __tablename__ = "meetings"
    __table_args__ = (
        CheckConstraint("duration_minutes > 0", name="ck_meetings_duration_positive"),
        CheckConstraint(
            "meeting_type = 'instant' OR scheduled_start IS NOT NULL",
            name="ck_meetings_scheduled_has_start",
        ),
        Index("ix_meetings_host_start", "host_id", "scheduled_start"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # The public, shareable 11 digit Meeting ID (e.g. 84523910472). Used in all URLs.
    meeting_code: Mapped[str] = mapped_column(String(11), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    host_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    meeting_type: Mapped[MeetingType] = mapped_column(db_enum(MeetingType, "meeting_type"))
    status: Mapped[MeetingStatus] = mapped_column(
        db_enum(MeetingStatus, "meeting_status"), default=MeetingStatus.SCHEDULED, index=True
    )

    scheduled_start: Mapped[datetime | None] = mapped_column(UTCDateTime)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")

    # Security / meeting options
    passcode: Mapped[str | None] = mapped_column(String(10))
    # Secret that identifies the host when starting the meeting (Zoom's "start URL" token).
    start_token: Mapped[str] = mapped_column(String(64))
    join_before_host: Mapped[bool] = mapped_column(Boolean, default=False)
    mute_on_entry: Mapped[bool] = mapped_column(Boolean, default=False)
    host_video_on: Mapped[bool] = mapped_column(Boolean, default=True)
    participant_video_on: Mapped[bool] = mapped_column(Boolean, default=True)
    waiting_room: Mapped[bool] = mapped_column(Boolean, default=False)
    # Set from the in-meeting Security menu; a locked meeting refuses new attendees.
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    host: Mapped[User] = relationship(back_populates="hosted_meetings")
    invitees: Mapped[list[MeetingInvitee]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", passive_deletes=True
    )
    participants: Mapped[list[MeetingParticipant]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="MeetingParticipant.joined_at",
    )
    messages: Mapped[list[ChatMessage]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ChatMessage.sent_at",
    )
    transcript: Mapped[list[TranscriptSegment]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="TranscriptSegment.spoken_at",
    )


class MeetingInvitee(Base):
    """People invited to a scheduled meeting. `user_id` is set when the email belongs to a user."""

    __tablename__ = "meeting_invitees"
    __table_args__ = (UniqueConstraint("meeting_id", "email", name="uq_invitee_meeting_email"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(255))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)

    meeting: Mapped[Meeting] = relationship(back_populates="invitees")
    user: Mapped[User | None] = relationship()
