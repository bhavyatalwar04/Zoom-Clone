"""Sample data so the dashboard is populated on first run.

Times are generated relative to "now", so there are always upcoming and recent meetings.
Run manually with:  python -m app.seed --reset
"""

import argparse
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import Base, SessionLocal, engine
from .models import (
    ActivityKind,
    ChatMessage,
    Meeting,
    MeetingActivity,
    MeetingInvitee,
    MeetingParticipant,
    MeetingStatus,
    MeetingType,
    ParticipantRole,
    TranscriptSegment,
    User,
)
from .security import generate_meeting_code, generate_passcode, generate_start_token

CONTACTS = [
    ("Priya Sharma", "priya.sharma@example.com", "#E8710A", "Product Manager"),
    ("Arjun Mehta", "arjun.mehta@example.com", "#12A150", "Engineering Manager"),
    ("Sara Khan", "sara.khan@example.com", "#9334E6", "Product Designer"),
    ("Rohan Verma", "rohan.verma@example.com", "#D93025", "Backend Engineer"),
    ("Emily Chen", "emily.chen@example.com", "#0E7490", "QA Lead"),
    ("David Wilson", "david.wilson@example.com", "#B45309", "Customer Success"),
]


def _at(day_offset: int, hour: int, minute: int = 0) -> datetime:
    """A UTC datetime `day_offset` days from today at hour:minute (in the demo user's day)."""
    now = datetime.now(timezone.utc)
    base = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return base + timedelta(days=day_offset)


def _meeting(host: User, title: str, start: datetime, minutes: int, **kwargs) -> Meeting:
    return Meeting(
        meeting_code=generate_meeting_code(),
        host=host,
        title=title,
        meeting_type=kwargs.pop("meeting_type", MeetingType.SCHEDULED),
        scheduled_start=start,
        duration_minutes=minutes,
        timezone=kwargs.pop("tz", "Asia/Kolkata"),
        passcode=generate_passcode(),
        start_token=generate_start_token(),
        **kwargs,
    )


def seed(db: Session) -> None:
    rng = random.Random(42)
    settings = get_settings()

    me = User(
        full_name="Bhavya Talwar",
        email=settings.default_user_email,
        avatar_color="#0B5CFF",
        job_title="Software Engineer",
        timezone="Asia/Kolkata",
    )
    contacts = [User(full_name=n, email=e, avatar_color=c, job_title=j, timezone="Asia/Kolkata") for n, e, c, j in CONTACTS]
    db.add_all([me, *contacts])
    db.flush()
    priya, arjun, sara, rohan, emily, david = contacts
    now = datetime.now(timezone.utc)

    # ---- upcoming (scheduled, not yet started)
    upcoming = [
        _meeting(me, "Daily Standup", now + timedelta(hours=1), 15,
                 description="Quick sync on yesterday's progress and today's plan.", join_before_host=True),
        _meeting(me, "Sprint Planning – Q4 Roadmap", _at(1, 5, 30), 60,
                 description="Plan the next sprint and estimate the backlog."),
        _meeting(me, "Design Review: Meeting Controls", _at(2, 9, 0), 45,
                 description="Walk through the new in-meeting toolbar designs.", mute_on_entry=True),
        _meeting(priya, "Product Sync with Priya", _at(1, 8, 0), 30,
                 description="Weekly product / engineering alignment."),
        _meeting(me, "1:1 with Arjun", _at(3, 6, 30), 30),
        _meeting(emily, "Release Readiness Check", _at(5, 10, 0), 45,
                 description="Go / no-go for the upcoming release."),
    ]
    invitee_map = {
        0: [priya, arjun, sara, rohan],
        1: [priya, arjun, rohan, emily],
        2: [sara, priya],
        3: [me, arjun],
        4: [arjun],
        5: [me, rohan, david],
    }
    for index, meeting in enumerate(upcoming):
        meeting.invitees = [MeetingInvitee(email=u.email, user_id=u.id) for u in invitee_map[index]]
    db.add_all(upcoming)

    # ---- recent (already took place)
    past_specs = [
        (me, "Architecture Discussion", -1, 7, 50, [arjun, rohan], MeetingType.SCHEDULED),
        (me, "Bhavya Talwar's Zoom Meeting", -1, 11, 22, [sara], MeetingType.INSTANT),
        (priya, "Customer Feedback Review", -2, 9, 40, [me, david, sara], MeetingType.SCHEDULED),
        (me, "Bug Bash", -3, 10, 65, [emily, rohan, arjun, priya], MeetingType.SCHEDULED),
        (arjun, "Team Retro", -6, 8, 45, [me, rohan, sara, emily], MeetingType.SCHEDULED),
    ]
    chat_lines = [
        "Hi everyone 👋",
        "Can you all see my screen?",
        "Yes, looks good!",
        "I'll share the notes after the call.",
        "Thanks, that was helpful.",
    ]
    for host, title, day, hour, minutes, attendees, kind in past_specs:
        start = _at(day, hour, rng.choice([0, 15, 30]))
        end = start + timedelta(minutes=minutes)
        meeting = _meeting(host, title, start, max(minutes, 15), meeting_type=kind,
                           status=MeetingStatus.ENDED, started_at=start, ended_at=end)
        if kind == MeetingType.SCHEDULED:
            meeting.invitees = [MeetingInvitee(email=u.email, user_id=u.id) for u in attendees if u is not host]
        meeting.participants = [
            MeetingParticipant(user_id=host.id, display_name=host.full_name, role=ParticipantRole.HOST,
                               joined_at=start, left_at=end)
        ] + [
            MeetingParticipant(user_id=u.id, display_name=u.full_name, role=ParticipantRole.ATTENDEE,
                               joined_at=start + timedelta(minutes=rng.randint(0, 4)), left_at=end)
            for u in attendees
        ]
        # An external guest (no account) who joined via the invite link.
        if len(attendees) > 2:
            meeting.participants.append(
                MeetingParticipant(display_name="Guest (Client)", role=ParticipantRole.ATTENDEE,
                                   joined_at=start + timedelta(minutes=5), left_at=end - timedelta(minutes=5))
            )
        # Talk time: the host speaks the most, everyone else a random share of the meeting.
        for participant in meeting.participants:
            share = 0.35 if participant.role == ParticipantRole.HOST else rng.uniform(0.05, 0.25)
            participant.talk_time_ms = int(minutes * 60_000 * share)
        db.add(meeting)
        db.flush()
        for offset, line in enumerate(chat_lines[: rng.randint(2, len(chat_lines))]):
            sender = meeting.participants[offset % len(meeting.participants)]
            db.add(ChatMessage(meeting_id=meeting.id, participant_id=sender.id, content=line,
                               sent_at=start + timedelta(minutes=2 + offset * 3)))
        _seed_activity(db, rng, meeting, start, minutes)
        _seed_transcript(db, meeting, start, title)

    db.commit()


REACTIONS = ["👏", "👍", "❤️", "😂", "😮", "🎉"]

TRANSCRIPTS = {
    "Architecture Discussion": [
        "Let's start with the current request flow and where the latency comes from.",
        "Most of the time is spent waiting on the database for the dashboard queries.",
        "Could we add an index on host and start time for the upcoming meetings list?",
        "Yes, and we can cache the contact list since it rarely changes.",
        "Great, I'll write that up and share the proposal by Friday.",
    ],
    "Bug Bash": [
        "Thanks for joining, the goal today is to break the new scheduling flow.",
        "I found that editing a meeting in a different time zone shifts it by an hour.",
        "Good catch, can you file that with the steps to reproduce?",
        "The join link works on mobile but the preview camera stays on after leaving.",
        "Let's prioritise the time zone bug for this sprint.",
    ],
}


def _seed_activity(db: Session, rng: random.Random, meeting: Meeting, start: datetime, minutes: int) -> None:
    for participant in meeting.participants:
        for _ in range(rng.randint(0, 4)):
            db.add(MeetingActivity(meeting_id=meeting.id, participant_id=participant.id,
                                   kind=ActivityKind.REACTION, detail=rng.choice(REACTIONS),
                                   created_at=start + timedelta(minutes=rng.randint(1, max(1, minutes - 1)))))
        if rng.random() < 0.4:
            db.add(MeetingActivity(meeting_id=meeting.id, participant_id=participant.id,
                                   kind=ActivityKind.HAND_RAISE,
                                   created_at=start + timedelta(minutes=rng.randint(1, max(1, minutes - 1)))))
    presenter = meeting.participants[0]
    db.add(MeetingActivity(meeting_id=meeting.id, participant_id=presenter.id,
                           kind=ActivityKind.SCREEN_SHARE, created_at=start + timedelta(minutes=3)))


def _seed_transcript(db: Session, meeting: Meeting, start: datetime, title: str) -> None:
    speakers = [p for p in meeting.participants if p.user_id is not None]
    for index, line in enumerate(TRANSCRIPTS.get(title, [])):
        speaker = speakers[index % len(speakers)]
        db.add(TranscriptSegment(meeting_id=meeting.id, participant_id=speaker.id, content=line,
                                 spoken_at=start + timedelta(minutes=1 + index * 2)))


def seed_if_empty() -> bool:
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)) is not None:
            return False
        seed(db)
        return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Zoom clone database with sample data.")
    parser.add_argument("--reset", action="store_true", help="drop all tables before seeding")
    args = parser.parse_args()
    if args.reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    print("Seeded sample data." if seed_if_empty() else "Database already has data; use --reset to re-seed.")


if __name__ == "__main__":
    main()
