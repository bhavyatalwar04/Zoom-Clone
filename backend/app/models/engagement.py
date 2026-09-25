"""What happens during a meeting: chat, transcript, activity log and local recordings."""

from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base, UTCDateTime, utcnow
from .base import db_enum

if TYPE_CHECKING:
    from .meeting import Meeting
    from .participant import MeetingParticipant


class ChatMessage(Base):
    """In-meeting chat, persisted so late joiners see the history.

    `recipient_participant_id` is set for private (direct) messages; NULL means "to Everyone".
    """

    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"), index=True)
    participant_id: Mapped[int] = mapped_column(
        ForeignKey("meeting_participants.id", ondelete="CASCADE"), index=True
    )
    recipient_participant_id: Mapped[int | None] = mapped_column(
        ForeignKey("meeting_participants.id", ondelete="CASCADE"), index=True
    )
    content: Mapped[str] = mapped_column(Text)
    sent_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    meeting: Mapped[Meeting] = relationship(back_populates="messages")
    participant: Mapped[MeetingParticipant] = relationship(foreign_keys=[participant_id])
    recipient: Mapped[MeetingParticipant | None] = relationship(foreign_keys=[recipient_participant_id])


class TranscriptSegment(Base):
    """One finalised caption line: who said what, and when."""

    __tablename__ = "transcript_segments"
    __table_args__ = (Index("ix_transcript_meeting_spoken", "meeting_id", "spoken_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    participant_id: Mapped[int] = mapped_column(
        ForeignKey("meeting_participants.id", ondelete="CASCADE"), index=True
    )
    content: Mapped[str] = mapped_column(Text)
    spoken_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    meeting: Mapped[Meeting] = relationship(back_populates="transcript")
    participant: Mapped[MeetingParticipant] = relationship()


class ActivityKind(str, enum.Enum):
    REACTION = "reaction"
    HAND_RAISE = "hand_raise"
    SCREEN_SHARE = "screen_share"


class MeetingActivity(Base):
    """Engagement events during a meeting (a log, so insights can be recomputed any way we like)."""

    __tablename__ = "meeting_activities"
    __table_args__ = (Index("ix_activities_meeting_kind", "meeting_id", "kind"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    participant_id: Mapped[int] = mapped_column(
        ForeignKey("meeting_participants.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[ActivityKind] = mapped_column(db_enum(ActivityKind, "activity_kind"))
    # The emoji for reactions; empty for other kinds.
    detail: Mapped[str | None] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    participant: Mapped[MeetingParticipant] = relationship()


class MeetingRecording(Base):
    """A "Record on this computer" session. The file stays on the recorder's machine; we keep
    who recorded, when and for how long, so everyone knows the meeting was recorded."""

    __tablename__ = "meeting_recordings"
    __table_args__ = (Index("ix_recordings_meeting", "meeting_id", "started_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    participant_id: Mapped[int] = mapped_column(ForeignKey("meeting_participants.id", ondelete="CASCADE"))
    started_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    participant: Mapped[MeetingParticipant] = relationship()
