"""In-meeting polls: a question with options, launched by the host, answered by participants."""

from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base, UTCDateTime, utcnow
from .base import db_enum

if TYPE_CHECKING:
    from .participant import MeetingParticipant


class PollStatus(str, enum.Enum):
    OPEN = "open"
    CLOSED = "closed"


class Poll(Base):
    __tablename__ = "polls"
    __table_args__ = (Index("ix_polls_meeting", "meeting_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    created_by_participant_id: Mapped[int] = mapped_column(ForeignKey("meeting_participants.id", ondelete="CASCADE"))
    question: Mapped[str] = mapped_column(Text)
    allow_multiple: Mapped[bool] = mapped_column(Boolean, default=False)
    # Anonymous polls never reveal who voted for what, even to the host.
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[PollStatus] = mapped_column(db_enum(PollStatus, "poll_status"), default=PollStatus.OPEN)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    created_by: Mapped[MeetingParticipant] = relationship()
    options: Mapped[list[PollOption]] = relationship(
        back_populates="poll", cascade="all, delete-orphan", passive_deletes=True, order_by="PollOption.position"
    )
    votes: Mapped[list[PollVote]] = relationship(back_populates="poll", cascade="all, delete-orphan", passive_deletes=True)


class PollOption(Base):
    __tablename__ = "poll_options"
    __table_args__ = (UniqueConstraint("poll_id", "position", name="uq_poll_option_position"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    poll_id: Mapped[int] = mapped_column(ForeignKey("polls.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(String(200))

    poll: Mapped[Poll] = relationship(back_populates="options")


class PollVote(Base):
    """One chosen option. Multiple-choice polls store one row per selected option."""

    __tablename__ = "poll_votes"
    __table_args__ = (
        UniqueConstraint("poll_id", "option_id", "participant_id", name="uq_poll_vote"),
        Index("ix_poll_votes_poll_participant", "poll_id", "participant_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    poll_id: Mapped[int] = mapped_column(ForeignKey("polls.id", ondelete="CASCADE"))
    option_id: Mapped[int] = mapped_column(ForeignKey("poll_options.id", ondelete="CASCADE"))
    participant_id: Mapped[int] = mapped_column(ForeignKey("meeting_participants.id", ondelete="CASCADE"))
    voted_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    poll: Mapped[Poll] = relationship(back_populates="votes")
    participant: Mapped[MeetingParticipant] = relationship()
