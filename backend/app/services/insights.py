"""Post-meeting insights: talk time and engagement per person, computed from the event tables."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import utcnow
from ..models import ActivityKind, ChatMessage, Meeting, MeetingActivity, ParticipantRole, TranscriptSegment
from ..schemas import EmojiCount, MeetingInsights, ParticipantInsight


@dataclass
class _Person:
    display_name: str
    is_host: bool = False
    attended_seconds: float = 0
    talk_ms: int = 0
    messages: int = 0
    reactions: int = 0
    hand_raises: int = 0
    transcript_lines: int = 0


def _count_by_participant(db: Session, model, meeting_id: int) -> dict[int, int]:
    rows = db.execute(
        select(model.participant_id, func.count()).where(model.meeting_id == meeting_id).group_by(model.participant_id)
    )
    return dict(rows.all())


def _minutes(start: datetime | None, end: datetime | None) -> int:
    if start is None:
        return 0
    return max(0, round(((end or utcnow()) - start).total_seconds() / 60))


def build_insights(db: Session, meeting: Meeting) -> MeetingInsights:
    messages = _count_by_participant(db, ChatMessage, meeting.id)
    transcript = _count_by_participant(db, TranscriptSegment, meeting.id)
    activities = db.execute(
        select(MeetingActivity.participant_id, MeetingActivity.kind, func.count())
        .where(MeetingActivity.meeting_id == meeting.id)
        .group_by(MeetingActivity.participant_id, MeetingActivity.kind)
    ).all()
    emoji_rows = db.execute(
        select(MeetingActivity.detail, func.count().label("n"))
        .where(MeetingActivity.meeting_id == meeting.id, MeetingActivity.kind == ActivityKind.REACTION)
        .group_by(MeetingActivity.detail)
        .order_by(func.count().desc())
    ).all()

    activity_counts: dict[tuple[int, ActivityKind], int] = {(pid, kind): n for pid, kind, n in activities}

    # One person can have several attendance rows (they left and rejoined): merge them by name.
    people: dict[str, _Person] = {}
    meeting_end = meeting.ended_at or utcnow()
    for p in meeting.participants:
        person = people.setdefault(p.display_name.strip().lower(), _Person(display_name=p.display_name))
        person.is_host |= p.role == ParticipantRole.HOST
        person.attended_seconds += max(0.0, ((p.left_at or meeting_end) - p.joined_at).total_seconds())
        person.talk_ms += p.talk_time_ms
        person.messages += messages.get(p.id, 0)
        person.transcript_lines += transcript.get(p.id, 0)
        person.reactions += activity_counts.get((p.id, ActivityKind.REACTION), 0)
        person.hand_raises += activity_counts.get((p.id, ActivityKind.HAND_RAISE), 0)

    total_talk_ms = sum(p.talk_ms for p in people.values())
    participants = sorted(
        (
            ParticipantInsight(
                display_name=p.display_name,
                is_host=p.is_host,
                attended_minutes=round(p.attended_seconds / 60),
                talk_seconds=round(p.talk_ms / 1000),
                talk_share=round(p.talk_ms / total_talk_ms, 4) if total_talk_ms else 0.0,
                messages=p.messages,
                reactions=p.reactions,
                hand_raises=p.hand_raises,
                transcript_lines=p.transcript_lines,
            )
            for p in people.values()
        ),
        key=lambda p: (-p.talk_seconds, p.display_name.lower()),
    )

    by_kind: defaultdict[ActivityKind, int] = defaultdict(int)
    for (_pid, kind), n in activity_counts.items():
        by_kind[kind] += n

    return MeetingInsights(
        duration_minutes=_minutes(meeting.started_at, meeting.ended_at),
        participant_count=len(people),
        total_talk_seconds=round(total_talk_ms / 1000),
        total_messages=sum(messages.values()),
        total_reactions=by_kind[ActivityKind.REACTION],
        total_hand_raises=by_kind[ActivityKind.HAND_RAISE],
        screen_shares=by_kind[ActivityKind.SCREEN_SHARE],
        transcript_lines=sum(transcript.values()),
        reactions_by_emoji=[EmojiCount(emoji=e, count=n) for e, n in emoji_rows if e],
        participants=participants,
    )
