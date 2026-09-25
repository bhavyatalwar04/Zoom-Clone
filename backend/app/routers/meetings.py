import json
from typing import Any, Literal

from fastapi import APIRouter, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..deps import CurrentUser, DbSession
from ..schemas import (
    BreakoutRoomOut,
    ChatMessageOut,
    InstantMeetingCreate,
    JoinRequest,
    JoinResponse,
    MeetingInsights,
    MeetingLookup,
    MeetingOut,
    ParticipantOut,
    PollView,
    ScheduledMeetingCreate,
    ScheduledMeetingUpdate,
    TranscriptSegmentOut,
)
from ..models import BreakoutAssignment, BreakoutRoom, WhiteboardStroke
from ..security import create_ws_token
from ..services import meetings as service
from ..services import polls as poll_service
from ..services.insights import build_insights

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


@router.get("", response_model=list[MeetingOut])
def list_meetings(
    db: DbSession,
    user: CurrentUser,
    scope: Literal["upcoming", "recent"] = "upcoming",
    limit: int = Query(default=50, ge=1, le=200),
):
    meetings = service.list_upcoming(db, user, limit) if scope == "upcoming" else service.list_recent(db, user, limit)
    return [service.to_meeting_out(m, user) for m in meetings]


@router.post("/instant", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
def create_instant_meeting(data: InstantMeetingCreate, db: DbSession, user: CurrentUser):
    return service.to_meeting_out(service.create_instant_meeting(db, user, data), user)


@router.post("", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
def schedule_meeting(data: ScheduledMeetingCreate, db: DbSession, user: CurrentUser):
    return service.to_meeting_out(service.schedule_meeting(db, user, data), user)


@router.get("/{code}", response_model=MeetingOut)
def get_meeting(code: str, db: DbSession, user: CurrentUser):
    return service.to_meeting_out(service.get_accessible_meeting(db, code, user), user)


@router.put("/{code}", response_model=MeetingOut)
def update_meeting(code: str, data: ScheduledMeetingUpdate, db: DbSession, user: CurrentUser):
    meeting = service.get_hosted_meeting(db, code, user)
    return service.to_meeting_out(service.update_scheduled_meeting(db, meeting, data), user)


@router.delete("/{code}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting(code: str, db: DbSession, user: CurrentUser):
    service.delete_meeting(db, service.get_hosted_meeting(db, code, user))


@router.get("/{code}/lookup", response_model=MeetingLookup)
def lookup_meeting(code: str, db: DbSession):
    """Public endpoint used by the join flow to validate that a Meeting ID exists."""
    return service.to_lookup(service.get_meeting(db, code))


@router.post("/{code}/join", response_model=JoinResponse)
def join_meeting(code: str, data: JoinRequest, db: DbSession, user: CurrentUser):
    meeting = service.get_meeting(db, code)
    participant, is_host = service.join_meeting(db, meeting, user, data)
    return JoinResponse(
        participant=ParticipantOut.model_validate(participant),
        ws_token=create_ws_token(participant.id, meeting.meeting_code),
        meeting=service.to_lookup(meeting),
        is_host=is_host,
        passcode=meeting.passcode,
        join_url=service.build_join_url(meeting),
        mute_on_entry=meeting.mute_on_entry and not is_host,
        video_on_entry=meeting.host_video_on if is_host else meeting.participant_video_on,
    )


@router.get("/{code}/participants", response_model=list[ParticipantOut])
def list_participants(code: str, db: DbSession, user: CurrentUser):
    return service.get_accessible_meeting(db, code, user).participants


@router.get("/{code}/messages", response_model=list[ChatMessageOut])
def list_messages(code: str, db: DbSession, user: CurrentUser):
    meeting = service.get_accessible_meeting(db, code, user)
    # The saved history is the main session's chat to everyone: private and breakout-room messages stay private.
    return [
        service.to_chat_out(m)
        for m in meeting.messages
        if m.recipient_participant_id is None and m.breakout_room_id is None
    ]


@router.get("/{code}/transcript", response_model=list[TranscriptSegmentOut])
def get_transcript(code: str, db: DbSession, user: CurrentUser):
    return [service.to_transcript_out(s) for s in service.get_accessible_meeting(db, code, user).transcript]


@router.get("/{code}/insights", response_model=MeetingInsights)
def get_insights(code: str, db: DbSession, user: CurrentUser):
    return build_insights(db, service.get_accessible_meeting(db, code, user))


@router.get("/{code}/polls", response_model=list[PollView])
def list_polls(code: str, db: DbSession, user: CurrentUser):
    meeting = service.get_accessible_meeting(db, code, user)
    return [poll_service.poll_view(p, with_results=True) for p in poll_service.list_polls(db, meeting.id)]

@router.get("/{code}/breakouts", response_model=list[BreakoutRoomOut])
def list_breakouts(code: str, db: DbSession, user: CurrentUser):
    meeting = service.get_accessible_meeting(db, code, user)
    rooms = db.scalars(
        select(BreakoutRoom)
        .where(BreakoutRoom.meeting_id == meeting.id)
        .order_by(BreakoutRoom.opened_at, BreakoutRoom.position)
        .options(selectinload(BreakoutRoom.assignments).selectinload(BreakoutAssignment.participant))
    ).all()
    return [
        BreakoutRoomOut(
            name=r.name,
            opened_at=r.opened_at,
            closed_at=r.closed_at,
            participants=list(dict.fromkeys(a.participant.display_name for a in r.assignments)),
        )
        for r in rooms
    ]


@router.get("/{code}/whiteboard")
def get_whiteboard(code: str, db: DbSession, user: CurrentUser) -> list[dict[str, Any]]:
    meeting = service.get_accessible_meeting(db, code, user)
    rows = db.scalars(select(WhiteboardStroke).where(WhiteboardStroke.meeting_id == meeting.id).order_by(WhiteboardStroke.id))
    return [json.loads(r.data) for r in rows]