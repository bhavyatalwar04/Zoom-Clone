"""Meeting business logic: creating, listing, joining and ending meetings.

Routers stay thin and call into this module; the realtime (WebSocket) layer uses it too.
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session, selectinload

from ..config import get_settings
from ..database import utcnow
from ..errors import AppError, MeetingNotFound, NotMeetingHost
from ..models import (
    ChatMessage,
    Meeting,
    MeetingInvitee,
    MeetingParticipant,
    MeetingStatus,
    MeetingType,
    ParticipantRole,
    User,
)
from ..schemas import (
    ChatMessageOut,
    InstantMeetingCreate,
    JoinRequest,
    MeetingLookup,
    MeetingOut,
    ScheduledMeetingCreate,
    UserOut,
)
from ..security import generate_meeting_code, generate_passcode, generate_start_token

# Scheduled meetings may be created slightly in the past (e.g. "now" rounded down).
_PAST_START_GRACE = timedelta(minutes=5)

_MEETING_LOAD_OPTIONS = (
    selectinload(Meeting.host),
    selectinload(Meeting.invitees),
    selectinload(Meeting.participants),
)


# --------------------------------------------------------------------------- helpers


def build_join_url(meeting: Meeting) -> str:
    base = get_settings().frontend_url.rstrip("/")
    url = f"{base}/j/{meeting.meeting_code}"
    return f"{url}?pwd={meeting.passcode}" if meeting.passcode else url


def _unique_meeting_code(db: Session) -> str:
    while True:
        code = generate_meeting_code()
        if not db.scalar(select(exists().where(Meeting.meeting_code == code))):
            return code


def _to_utc(value: datetime, tz_name: str) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=ZoneInfo(tz_name))
    return value.astimezone(timezone.utc)


def _meeting_end(meeting: Meeting) -> datetime | None:
    if meeting.scheduled_start is None:
        return None
    return meeting.scheduled_start + timedelta(minutes=meeting.duration_minutes)


def _set_invitees(db: Session, meeting: Meeting, emails: list[str]) -> None:
    # Keep existing rows for unchanged emails: replacing the whole collection would INSERT the
    # new rows before DELETEing the old ones and trip the (meeting_id, email) unique constraint.
    existing = {invitee.email: invitee for invitee in meeting.invitees}
    users_by_email = {u.email.lower(): u for u in db.scalars(select(User).where(User.email.in_(emails)))}
    meeting.invitees = [
        existing.get(email)
        or MeetingInvitee(email=email, user_id=users_by_email[email].id if email in users_by_email else None)
        for email in emails
    ]


def to_meeting_out(meeting: Meeting, current_user: User) -> MeetingOut:
    is_host = meeting.host_id == current_user.id
    return MeetingOut(
        code=meeting.meeting_code,
        title=meeting.title,
        description=meeting.description,
        meeting_type=meeting.meeting_type,
        status=meeting.status,
        scheduled_start=meeting.scheduled_start,
        duration_minutes=meeting.duration_minutes,
        timezone=meeting.timezone,
        passcode=meeting.passcode,
        join_url=build_join_url(meeting),
        host=UserOut.model_validate(meeting.host),
        is_host=is_host,
        start_token=meeting.start_token if is_host else None,
        invitees=[i.email for i in meeting.invitees],
        participant_count=len({p.display_name.lower() for p in meeting.participants}),
        join_before_host=meeting.join_before_host,
        mute_on_entry=meeting.mute_on_entry,
        host_video_on=meeting.host_video_on,
        participant_video_on=meeting.participant_video_on,
        created_at=meeting.created_at,
        started_at=meeting.started_at,
        ended_at=meeting.ended_at,
    )


def to_lookup(meeting: Meeting) -> MeetingLookup:
    return MeetingLookup(
        code=meeting.meeting_code,
        title=meeting.title,
        host_name=meeting.host.full_name,
        status=meeting.status,
        meeting_type=meeting.meeting_type,
        scheduled_start=meeting.scheduled_start,
        requires_passcode=meeting.passcode is not None,
        join_before_host=meeting.join_before_host,
    )


def to_chat_out(message: ChatMessage) -> ChatMessageOut:
    return ChatMessageOut(
        id=message.id,
        participant_id=message.participant_id,
        sender_name=message.participant.display_name,
        content=message.content,
        sent_at=message.sent_at,
    )


# --------------------------------------------------------------------------- queries


def normalize_code(raw: str) -> str:
    """Accepts '845 2931 0472', '845-2931-0472' or a full invite link and returns the digits."""
    raw = raw.strip()
    if "/j/" in raw:
        raw = raw.split("/j/", 1)[1].split("?", 1)[0].split("#", 1)[0]
    return "".join(ch for ch in raw if ch.isdigit())


def get_meeting(db: Session, code: str) -> Meeting:
    meeting = db.scalar(
        select(Meeting).where(Meeting.meeting_code == normalize_code(code)).options(*_MEETING_LOAD_OPTIONS)
    )
    if meeting is None:
        raise MeetingNotFound()
    return meeting


def get_hosted_meeting(db: Session, code: str, user: User) -> Meeting:
    meeting = get_meeting(db, code)
    if meeting.host_id != user.id:
        raise NotMeetingHost()
    return meeting


def _involving(user: User):
    """Meetings the user hosts, is invited to, or has attended."""
    invited = exists().where(MeetingInvitee.meeting_id == Meeting.id, MeetingInvitee.user_id == user.id)
    attended = exists().where(MeetingParticipant.meeting_id == Meeting.id, MeetingParticipant.user_id == user.id)
    return or_(Meeting.host_id == user.id, invited, attended)


def list_upcoming(db: Session, user: User, limit: int = 50) -> list[Meeting]:
    """Scheduled meetings that have not finished yet, soonest first."""
    now = utcnow()
    candidates = db.scalars(
        select(Meeting)
        .where(
            _involving(user),
            Meeting.meeting_type == MeetingType.SCHEDULED,
            Meeting.status != MeetingStatus.ENDED,
            # Longest allowed duration is 24h, so anything that started earlier is certainly over.
            Meeting.scheduled_start >= now - timedelta(hours=24),
        )
        .order_by(Meeting.scheduled_start)
        .options(*_MEETING_LOAD_OPTIONS)
    ).all()
    upcoming = [m for m in candidates if m.status == MeetingStatus.LIVE or (_meeting_end(m) or now) > now]
    return upcoming[:limit]


def list_recent(db: Session, user: User, limit: int = 50) -> list[Meeting]:
    """Meetings that actually took place, most recently finished first."""
    return list(
        db.scalars(
            select(Meeting)
            .where(_involving(user), Meeting.started_at.is_not(None), Meeting.status == MeetingStatus.ENDED)
            .order_by(Meeting.ended_at.desc())
            .limit(limit)
            .options(*_MEETING_LOAD_OPTIONS)
        ).all()
    )


# --------------------------------------------------------------------------- commands


def create_instant_meeting(db: Session, host: User, data: InstantMeetingCreate) -> Meeting:
    meeting = Meeting(
        meeting_code=_unique_meeting_code(db),
        title=(data.title or "").strip() or f"{host.full_name}'s Zoom Meeting",
        host=host,
        meeting_type=MeetingType.INSTANT,
        status=MeetingStatus.SCHEDULED,
        duration_minutes=60,
        timezone=host.timezone,
        passcode=generate_passcode(),
        start_token=generate_start_token(),
        host_video_on=data.host_video_on,
    )
    db.add(meeting)
    db.commit()
    return get_meeting(db, meeting.meeting_code)


def _apply_schedule(db: Session, meeting: Meeting, data: ScheduledMeetingCreate) -> None:
    start = _to_utc(data.start_time, data.timezone)
    # Only a *changed* start time must be in the future, so older meetings can still be edited.
    if start != meeting.scheduled_start and start < utcnow() - _PAST_START_GRACE:
        raise AppError(422, "START_IN_PAST", "The meeting start time cannot be in the past.")

    meeting.title = data.title
    meeting.description = (data.description or "").strip() or None
    meeting.scheduled_start = start
    meeting.duration_minutes = data.duration_minutes
    meeting.timezone = data.timezone
    if not data.require_passcode:
        meeting.passcode = None
    else:
        meeting.passcode = data.passcode or meeting.passcode or generate_passcode()
    meeting.join_before_host = data.join_before_host
    meeting.mute_on_entry = data.mute_on_entry
    meeting.host_video_on = data.host_video_on
    meeting.participant_video_on = data.participant_video_on
    _set_invitees(db, meeting, data.invitees)


def schedule_meeting(db: Session, host: User, data: ScheduledMeetingCreate) -> Meeting:
    meeting = Meeting(
        meeting_code=_unique_meeting_code(db),
        host=host,
        meeting_type=MeetingType.SCHEDULED,
        status=MeetingStatus.SCHEDULED,
        start_token=generate_start_token(),
    )
    _apply_schedule(db, meeting, data)
    db.add(meeting)
    db.commit()
    return get_meeting(db, meeting.meeting_code)


def update_scheduled_meeting(db: Session, meeting: Meeting, data: ScheduledMeetingCreate) -> Meeting:
    if meeting.meeting_type != MeetingType.SCHEDULED:
        raise AppError(400, "NOT_SCHEDULED", "Only scheduled meetings can be edited.")
    _apply_schedule(db, meeting, data)
    db.commit()
    return get_meeting(db, meeting.meeting_code)


def delete_meeting(db: Session, meeting: Meeting) -> None:
    if meeting.status == MeetingStatus.LIVE:
        raise AppError(409, "MEETING_LIVE", "End the meeting before deleting it.")
    db.delete(meeting)
    db.commit()


def join_meeting(db: Session, meeting: Meeting, user: User, data: JoinRequest) -> tuple[MeetingParticipant, bool]:
    """Validates a join request and records the attendance. Returns (participant, is_host)."""
    is_host = bool(data.start_token) and data.start_token == meeting.start_token

    if not is_host:
        if meeting.passcode and (data.passcode or "").strip() != meeting.passcode:
            code = "PASSCODE_REQUIRED" if not data.passcode else "INVALID_PASSCODE"
            raise AppError(401, code, "Incorrect meeting passcode. Please try again.")
        if meeting.status != MeetingStatus.LIVE and not meeting.join_before_host:
            raise AppError(409, "WAITING_FOR_HOST", "Please wait, the meeting host will let you in soon.")

    now = utcnow()
    if meeting.status != MeetingStatus.LIVE:
        meeting.status = MeetingStatus.LIVE
        meeting.started_at = now
        meeting.ended_at = None

    participant = MeetingParticipant(
        meeting=meeting,
        user_id=user.id,
        display_name=data.display_name,
        role=ParticipantRole.HOST if is_host else ParticipantRole.ATTENDEE,
        joined_at=now,
    )
    db.add(participant)
    db.commit()
    return participant, is_host


def end_meeting(db: Session, meeting_id: int) -> None:
    meeting = db.get(Meeting, meeting_id)
    if meeting is None or meeting.status == MeetingStatus.ENDED:
        return
    now = utcnow()
    meeting.status = MeetingStatus.ENDED
    meeting.ended_at = now
    for participant in meeting.participants:
        if participant.left_at is None:
            participant.left_at = now
    db.commit()
