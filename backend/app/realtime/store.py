"""Synchronous database helpers for the realtime layer.

SQLAlchemy + SQLite are synchronous, so the async WebSocket code calls these through
`run_in_threadpool` (see `db()` below). Each helper opens a short-lived session.
"""

from datetime import timedelta
from typing import Any, Callable, TypeVar

import json

from sqlalchemy import delete, or_, select, update
from starlette.concurrency import run_in_threadpool

from ..database import SessionLocal, utcnow
from ..models import (
    ActivityKind,
    BreakoutAssignment,
    BreakoutRoom,
    ChatMessage,
    Meeting,
    MeetingActivity,
    MeetingParticipant,
    MeetingRecording,
    MeetingStatus,
    ParticipantRole,
    TranscriptSegment,
    WhiteboardStroke,
)
from ..services import meetings as meeting_service
from ..services import polls as poll_service

HISTORY_LIMIT = 200
T = TypeVar("T")


async def db(fn: Callable[..., T], *args: Any) -> T:
    """Run a blocking helper from async code."""
    return await run_in_threadpool(fn, *args)


def open_session(participant_id: int, code: str) -> dict[str, Any] | None:
    """Validates the participant and marks them present. Returns what the socket needs, or None."""
    with SessionLocal() as session:
        participant = session.get(MeetingParticipant, participant_id)
        if participant is None or participant.was_removed:
            return None
        meeting = participant.meeting
        if meeting.meeting_code != code or meeting.status == MeetingStatus.ENDED:
            return None
        participant.left_at = None
        session.commit()
        return {
            "meeting_id": meeting.id,
            "title": meeting.title,
            "display_name": participant.display_name,
            "role": participant.role.value,
            "locked": meeting.is_locked,
            "waiting_room": meeting.waiting_room,
        }


def load_history(meeting_id: int, participant_id: int, breakout_room_id: int | None = None) -> dict[str, list]:
    """Chat this participant may see in their room (public + their private messages) and the transcript."""
    with SessionLocal() as session:
        messages = session.scalars(
            select(ChatMessage)
            .where(
                ChatMessage.meeting_id == meeting_id,
                ChatMessage.breakout_room_id.is_(None)
                if breakout_room_id is None
                else ChatMessage.breakout_room_id == breakout_room_id,
                or_(
                    ChatMessage.recipient_participant_id.is_(None),
                    ChatMessage.participant_id == participant_id,
                    ChatMessage.recipient_participant_id == participant_id,
                ),
            )
            .order_by(ChatMessage.sent_at.desc())
            .limit(HISTORY_LIMIT)
        ).all()
        transcript = session.scalars(
            select(TranscriptSegment)
            .where(TranscriptSegment.meeting_id == meeting_id)
            .order_by(TranscriptSegment.spoken_at.desc())
            .limit(HISTORY_LIMIT)
        ).all()
        return {
            "messages": [meeting_service.to_chat_out(m).model_dump(mode="json") for m in reversed(messages)],
            "transcript": [meeting_service.to_transcript_out(s).model_dump(mode="json") for s in reversed(transcript)],
        }


def mark_left(participant_id: int, removed: bool = False) -> None:
    with SessionLocal() as session:
        participant = session.get(MeetingParticipant, participant_id)
        if participant is None:
            return
        participant.left_at = participant.left_at or utcnow()
        participant.was_removed = participant.was_removed or removed
        session.commit()


def save_chat(
    meeting_id: int, participant_id: int, text: str, recipient_id: int | None, breakout_room_id: int | None = None
) -> dict[str, Any]:
    with SessionLocal() as session:
        message = ChatMessage(
            meeting_id=meeting_id,
            participant_id=participant_id,
            recipient_participant_id=recipient_id,
            breakout_room_id=breakout_room_id,
            content=text,
        )
        session.add(message)
        session.commit()
        session.refresh(message)
        return meeting_service.to_chat_out(message).model_dump(mode="json")


def save_transcript(meeting_id: int, participant_id: int, text: str) -> dict[str, Any]:
    with SessionLocal() as session:
        segment = TranscriptSegment(meeting_id=meeting_id, participant_id=participant_id, content=text)
        session.add(segment)
        session.commit()
        session.refresh(segment)
        return meeting_service.to_transcript_out(segment).model_dump(mode="json")


def log_activity(meeting_id: int, participant_id: int, kind: ActivityKind, detail: str | None = None) -> None:
    with SessionLocal() as session:
        session.add(MeetingActivity(meeting_id=meeting_id, participant_id=participant_id, kind=kind, detail=detail))
        session.commit()


def add_talk_time(participant_id: int, ms: int) -> None:
    with SessionLocal() as session:
        session.execute(
            update(MeetingParticipant)
            .where(MeetingParticipant.id == participant_id)
            .values(talk_time_ms=MeetingParticipant.talk_time_ms + ms)
        )
        session.commit()


def set_role(participant_id: int, role: str) -> None:
    with SessionLocal() as session:
        session.execute(
            update(MeetingParticipant).where(MeetingParticipant.id == participant_id).values(role=ParticipantRole(role))
        )
        session.commit()


def rename_participant(participant_id: int, name: str) -> None:
    with SessionLocal() as session:
        session.execute(update(MeetingParticipant).where(MeetingParticipant.id == participant_id).values(display_name=name))
        session.commit()


def set_meeting_flags(meeting_id: int, **flags: bool) -> None:
    """Persists the Security menu switches that the REST join endpoint must also respect."""
    columns = {"locked": "is_locked", "waiting_room": "waiting_room"}
    values = {columns[k]: v for k, v in flags.items() if k in columns}
    if not values:
        return
    with SessionLocal() as session:
        session.execute(update(Meeting).where(Meeting.id == meeting_id).values(**values))
        session.commit()


def end_meeting(meeting_id: int) -> None:
    with SessionLocal() as session:
        meeting_service.end_meeting(session, meeting_id)


def end_abandoned(connected_codes: set[str], grace: timedelta) -> list[str]:
    with SessionLocal() as session:
        return meeting_service.end_abandoned_meetings(session, connected_codes, grace)


# --------------------------------------------------------------------------- polls


def poll_create(meeting_id: int, participant_id: int, data: dict[str, Any]):
    with SessionLocal() as session:
        return poll_service.create_poll(
            session,
            meeting_id,
            participant_id,
            data.get("question", ""),
            data.get("options") if isinstance(data.get("options"), list) else [],
            allow_multiple=data.get("allow_multiple") is True,
            anonymous=data.get("anonymous") is True,
        )


def poll_vote(meeting_id: int, participant_id: int, poll_id: int, option_ids: list[int]):
    with SessionLocal() as session:
        return poll_service.vote(session, poll_id, meeting_id, participant_id, option_ids)


def poll_close(meeting_id: int, poll_id: int):
    with SessionLocal() as session:
        return poll_service.close_poll(session, poll_id, meeting_id)


def polls_for(meeting_id: int):
    with SessionLocal() as session:
        return poll_service.list_polls(session, meeting_id)


# --------------------------------------------------------------------------- recordings


def recording_start(meeting_id: int, participant_id: int) -> int:
    with SessionLocal() as session:
        recording = MeetingRecording(meeting_id=meeting_id, participant_id=participant_id)
        session.add(recording)
        session.commit()
        return recording.id


def recording_stop(recording_id: int) -> None:
    with SessionLocal() as session:
        session.execute(
            update(MeetingRecording)
            .where(MeetingRecording.id == recording_id, MeetingRecording.ended_at.is_(None))
            .values(ended_at=utcnow())
        )
        session.commit()

# --------------------------------------------------------------------------- breakout rooms


def breakout_open(meeting_id: int, names: list[str]) -> list[int]:
    with SessionLocal() as session:
        rows = [BreakoutRoom(meeting_id=meeting_id, name=name, position=i) for i, name in enumerate(names)]
        session.add_all(rows)
        session.commit()
        return [r.id for r in rows]


def breakout_close(room_ids: list[int]) -> None:
    with SessionLocal() as session:
        now = utcnow()
        session.execute(update(BreakoutRoom).where(BreakoutRoom.id.in_(room_ids)).values(closed_at=now))
        session.execute(
            update(BreakoutAssignment)
            .where(BreakoutAssignment.breakout_room_id.in_(room_ids), BreakoutAssignment.left_at.is_(None))
            .values(left_at=now)
        )
        session.commit()


def breakout_enter(room_id: int, participant_id: int) -> int:
    with SessionLocal() as session:
        row = BreakoutAssignment(breakout_room_id=room_id, participant_id=participant_id)
        session.add(row)
        session.commit()
        return row.id


def breakout_exit(assignment_id: int) -> None:
    with SessionLocal() as session:
        session.execute(
            update(BreakoutAssignment)
            .where(BreakoutAssignment.id == assignment_id, BreakoutAssignment.left_at.is_(None))
            .values(left_at=utcnow())
        )
        session.commit()


# --------------------------------------------------------------------------- whiteboard


def whiteboard_load(meeting_id: int) -> list[dict[str, Any]]:
    with SessionLocal() as session:
        rows = session.scalars(
            select(WhiteboardStroke).where(WhiteboardStroke.meeting_id == meeting_id).order_by(WhiteboardStroke.id)
        ).all()
        return [json.loads(r.data) for r in rows]


def whiteboard_save(meeting_id: int, participant_id: int, stroke: dict[str, Any]) -> None:
    with SessionLocal() as session:
        session.add(
            WhiteboardStroke(meeting_id=meeting_id, participant_id=participant_id, stroke_key=stroke["id"], data=json.dumps(stroke))
        )
        session.commit()


def whiteboard_erase(meeting_id: int, keys: list[str] | None) -> None:
    """Deletes the given strokes, or all of them when `keys` is None."""
    with SessionLocal() as session:
        query = delete(WhiteboardStroke).where(WhiteboardStroke.meeting_id == meeting_id)
        if keys is not None:
            query = query.where(WhiteboardStroke.stroke_key.in_(keys))
        session.execute(query)
        session.commit()