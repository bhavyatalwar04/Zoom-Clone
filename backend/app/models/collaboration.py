"""Breakout rooms and the shared whiteboard."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base, UTCDateTime, utcnow

if TYPE_CHECKING:
    from .participant import MeetingParticipant


class BreakoutRoom(Base):
    """A breakout room opened during a meeting (one row per room per breakout session)."""

    __tablename__ = "breakout_rooms"
    __table_args__ = (Index("ix_breakout_rooms_meeting", "meeting_id", "opened_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(60))
    position: Mapped[int] = mapped_column(Integer)
    opened_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    assignments: Mapped[list[BreakoutAssignment]] = relationship(
        back_populates="breakout_room", cascade="all, delete-orphan", passive_deletes=True
    )


class BreakoutAssignment(Base):
    """Someone's time in a breakout room (they can leave and come back, so several rows)."""

    __tablename__ = "breakout_assignments"
    __table_args__ = (Index("ix_breakout_assignments_room", "breakout_room_id", "participant_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    breakout_room_id: Mapped[int] = mapped_column(ForeignKey("breakout_rooms.id", ondelete="CASCADE"))
    participant_id: Mapped[int] = mapped_column(ForeignKey("meeting_participants.id", ondelete="CASCADE"))
    joined_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    left_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    breakout_room: Mapped[BreakoutRoom] = relationship(back_populates="assignments")
    participant: Mapped[MeetingParticipant] = relationship()


class WhiteboardStroke(Base):
    """One finished whiteboard element (pen stroke, shape or text) as JSON.

    `stroke_key` is the id the drawing client generated, so live updates, erasing and saving
    all refer to the same element.
    """

    __tablename__ = "whiteboard_strokes"
    __table_args__ = (UniqueConstraint("meeting_id", "stroke_key", name="uq_whiteboard_stroke_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    participant_id: Mapped[int] = mapped_column(ForeignKey("meeting_participants.id", ondelete="CASCADE"))
    stroke_key: Mapped[str] = mapped_column(String(64))
    data: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
