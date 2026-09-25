"""Pydantic request / response models (the API contract)."""

import re
from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .models import MeetingStatus, MeetingType, ParticipantRole, PollStatus, RecurrenceType

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PASSCODE_RE = re.compile(r"^[A-Za-z0-9@_*-]{1,10}$")


def _validate_timezone(value: str) -> str:
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError(f"Unknown time zone '{value}'") from exc
    return value


# --------------------------------------------------------------------------- users


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str
    avatar_color: str
    job_title: str | None
    timezone: str
    personal_meeting_id: str | None = None


# --------------------------------------------------------------------------- auth


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    email: str = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("full_name")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Please enter your name")
        return value

    @field_validator("email")
    @classmethod
    def _check_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not _EMAIL_RE.match(value):
            raise ValueError("Please enter a valid email address")
        return value


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: UserOut


# --------------------------------------------------------------------------- meetings


class MeetingOptions(BaseModel):
    join_before_host: bool = False
    mute_on_entry: bool = False
    host_video_on: bool = True
    participant_video_on: bool = True
    waiting_room: bool = False


class InstantMeetingCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    host_video_on: bool = True
    # Start the host's Personal Meeting Room instead of a new meeting.
    use_pmi: bool = False


class RecurrenceOut(BaseModel):
    type: RecurrenceType
    interval: int
    count: int | None
    until: datetime | None


class ScheduledMeetingCreate(MeetingOptions):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    # A naive value is interpreted as wall-clock time in `timezone`; an aware value is used as is.
    start_time: datetime
    duration_minutes: int = Field(default=60, ge=15, le=24 * 60)
    timezone: str = "UTC"
    require_passcode: bool = True
    passcode: str | None = None
    invitees: list[str] = Field(default_factory=list, max_length=100)
    # Recurring meeting: repeat every `recurrence_interval` days / weeks / months, ending after
    # `recurrence_count` occurrences or on `recurrence_end_date`.
    recurrence: RecurrenceType | None = None
    recurrence_interval: int = Field(default=1, ge=1, le=30)
    recurrence_count: int | None = Field(default=None, ge=2, le=50)
    recurrence_end_date: date | None = None

    @model_validator(mode="after")
    def _check_recurrence(self):
        if self.recurrence is None:
            self.recurrence_count = self.recurrence_end_date = None
        elif (self.recurrence_count is None) == (self.recurrence_end_date is None):
            raise ValueError("Choose when the recurring meeting ends: after a number of occurrences or on a date")
        elif self.recurrence_end_date is not None and self.recurrence_end_date < self.start_time.date():
            raise ValueError("The recurrence end date must be after the first meeting")
        return self

    @field_validator("title")
    @classmethod
    def _strip_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Topic is required")
        return value

    @field_validator("timezone")
    @classmethod
    def _check_timezone(cls, value: str) -> str:
        return _validate_timezone(value)

    @field_validator("passcode")
    @classmethod
    def _check_passcode(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        if not _PASSCODE_RE.match(value):
            raise ValueError("Passcode must be 1-10 characters: letters, numbers and @ - _ *")
        return value

    @field_validator("invitees")
    @classmethod
    def _check_invitees(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []
        for raw in values:
            email = raw.strip().lower()
            if not email:
                continue
            if not _EMAIL_RE.match(email):
                raise ValueError(f"'{raw}' is not a valid email address")
            if email not in cleaned:
                cleaned.append(email)
        return cleaned


class ScheduledMeetingUpdate(ScheduledMeetingCreate):
    """Editing a meeting re-submits the whole schedule form (same rules as creating one)."""


class MeetingOut(MeetingOptions):
    code: str
    title: str
    description: str | None
    meeting_type: MeetingType
    status: MeetingStatus
    scheduled_start: datetime | None
    duration_minutes: int
    timezone: str
    passcode: str | None
    join_url: str
    host: UserOut
    is_host: bool
    # Only present for the host: lets them start the meeting with host privileges.
    start_token: str | None = None
    invitees: list[str]
    participant_count: int
    created_at: datetime
    started_at: datetime | None
    ended_at: datetime | None
    # For recurring meetings: `scheduled_start` is the occurrence shown, `series_start` the first one.
    series_start: datetime | None = None
    recurrence: RecurrenceOut | None = None
    next_occurrences: list[datetime] = Field(default_factory=list)


class MeetingLookup(BaseModel):
    """Public information about a meeting, used by the join flow before the user is admitted."""

    code: str
    title: str
    host_name: str
    status: MeetingStatus
    meeting_type: MeetingType
    scheduled_start: datetime | None
    duration_minutes: int
    started_at: datetime | None
    requires_passcode: bool
    join_before_host: bool


# --------------------------------------------------------------------------- joining


class JoinRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    passcode: str | None = None
    start_token: str | None = None

    @field_validator("display_name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Please enter your name")
        return value


class ParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None
    display_name: str
    role: ParticipantRole
    joined_at: datetime
    left_at: datetime | None
    was_removed: bool


class JoinResponse(BaseModel):
    participant: ParticipantOut
    ws_token: str
    meeting: MeetingLookup
    is_host: bool
    passcode: str | None
    join_url: str
    mute_on_entry: bool
    video_on_entry: bool


class ChatMessageOut(BaseModel):
    id: int
    participant_id: int
    sender_name: str
    # Set for private messages; None means the message was sent to everyone.
    recipient_id: int | None = None
    recipient_name: str | None = None
    content: str
    sent_at: datetime


class TranscriptSegmentOut(BaseModel):
    id: int
    participant_id: int
    speaker_name: str
    content: str
    spoken_at: datetime


# --------------------------------------------------------------------------- polls & recordings


class PollOptionView(BaseModel):
    id: int
    text: str
    votes: int | None = None  # hidden from participants until the poll ends
    voters: list[str] | None = None  # only for non-anonymous polls, only with results


class PollView(BaseModel):
    id: int
    question: str
    allow_multiple: bool
    is_anonymous: bool
    status: PollStatus
    created_at: datetime
    closed_at: datetime | None
    options: list[PollOptionView]
    total_voters: int | None = None
    my_votes: list[int] = Field(default_factory=list)


class BreakoutRoomOut(BaseModel):
    name: str
    opened_at: datetime
    closed_at: datetime | None
    participants: list[str]


class RecordingOut(BaseModel):
    recorded_by: str
    started_at: datetime
    ended_at: datetime | None
    duration_seconds: int


# --------------------------------------------------------------------------- insights


class ParticipantInsight(BaseModel):
    """Everything one person did in a meeting (rejoins are merged by display name)."""

    display_name: str
    is_host: bool
    attended_minutes: int
    talk_seconds: int
    talk_share: float  # 0..1 of all talk time in the meeting
    messages: int
    reactions: int
    hand_raises: int
    transcript_lines: int


class EmojiCount(BaseModel):
    emoji: str
    count: int


class MeetingInsights(BaseModel):
    duration_minutes: int
    participant_count: int
    total_talk_seconds: int
    total_messages: int
    total_reactions: int
    total_hand_raises: int
    screen_shares: int
    transcript_lines: int
    polls: int
    recordings: list[RecordingOut]
    reactions_by_emoji: list[EmojiCount]
    participants: list[ParticipantInsight]


class ErrorDetail(BaseModel):
    code: str
    message: str
