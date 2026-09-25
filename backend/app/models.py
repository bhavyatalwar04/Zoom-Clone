"""Database schema.

    users ──< meetings (host_id)
    users ──< meeting_participants (user_id, nullable for guests)
    meetings ──< meeting_invitees
    meetings ──< meeting_participants ──< chat_messages
    meetings ──< chat_messages

A *meeting* is the thing you schedule or start (it owns the Meeting ID, passcode and settings).
A *participant* row is one attendance of a meeting: it is created every time someone joins
and closed (left_at) when they leave, which gives us the meeting history for "Recent meetings".
"""

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, UTCDateTime, utcnow


class MeetingType(str, enum.Enum):
    INSTANT = "instant"
    SCHEDULED = "scheduled"


class MeetingStatus(str, enum.Enum):
    SCHEDULED = "scheduled"  # created, host has not started it yet
    LIVE = "live"  # someone is currently in the meeting
    ENDED = "ended"  # the meeting took place and is now over


class ParticipantRole(str, enum.Enum):
    HOST = "host"
    ATTENDEE = "attendee"


def _enum(enum_cls: type[enum.Enum], name: str) -> Enum:
    # Persist the lowercase value ("live") rather than the member name ("LIVE").
    return Enum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e], native_enum=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    avatar_color: Mapped[str] = mapped_column(String(7), default="#0B5CFF")
    job_title: Mapped[str | None] = mapped_column(String(120))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    hosted_meetings: Mapped[list["Meeting"]] = relationship(back_populates="host")


class Meeting(Base):
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
    meeting_type: Mapped[MeetingType] = mapped_column(_enum(MeetingType, "meeting_type"))
    status: Mapped[MeetingStatus] = mapped_column(
        _enum(MeetingStatus, "meeting_status"), default=MeetingStatus.SCHEDULED, index=True
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

    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    host: Mapped[User] = relationship(back_populates="hosted_meetings")
    invitees: Mapped[list["MeetingInvitee"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", passive_deletes=True
    )
    participants: Mapped[list["MeetingParticipant"]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="MeetingParticipant.joined_at",
    )
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ChatMessage.sent_at",
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


class MeetingParticipant(Base):
    """One attendance of a meeting (a join -> leave session)."""

    __tablename__ = "meeting_participants"
    __table_args__ = (Index("ix_participants_meeting_left", "meeting_id", "left_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    # NULL for guests who joined through an invite link without an account.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    display_name: Mapped[str] = mapped_column(String(80))
    role: Mapped[ParticipantRole] = mapped_column(
        _enum(ParticipantRole, "participant_role"), default=ParticipantRole.ATTENDEE
    )
    joined_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    left_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    was_removed: Mapped[bool] = mapped_column(Boolean, default=False)

    meeting: Mapped[Meeting] = relationship(back_populates="participants")
    user: Mapped[User | None] = relationship()


class ChatMessage(Base):
    """In-meeting chat, persisted so late joiners see the history."""

    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    participant_id: Mapped[int] = mapped_column(
        ForeignKey("meeting_participants.id", ondelete="CASCADE"), index=True
    )
    content: Mapped[str] = mapped_column(Text)
    sent_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    meeting: Mapped[Meeting] = relationship(back_populates="messages")
    participant: Mapped[MeetingParticipant] = relationship()
