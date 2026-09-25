"""In-meeting polls: create, vote, close and present results."""

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import utcnow
from ..errors import AppError
from ..models import Poll, PollOption, PollStatus, PollVote
from ..schemas import PollOptionView, PollView

MAX_QUESTION_LENGTH = 300
MAX_OPTION_LENGTH = 200
MIN_OPTIONS, MAX_OPTIONS = 2, 10


class PollError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(400, "INVALID_POLL", message)


def _load(db: Session, poll_id: int, meeting_id: int) -> Poll:
    poll = db.scalar(
        select(Poll)
        .where(Poll.id == poll_id, Poll.meeting_id == meeting_id)
        .options(selectinload(Poll.options), selectinload(Poll.votes).selectinload(PollVote.participant))
    )
    if poll is None:
        raise PollError("That poll no longer exists.")
    return poll


def create_poll(
    db: Session,
    meeting_id: int,
    participant_id: int,
    question: str,
    options: list[str],
    allow_multiple: bool = False,
    anonymous: bool = False,
) -> Poll:
    question = " ".join(str(question or "").split())
    cleaned = [" ".join(str(o or "").split()) for o in options if str(o or "").strip()]
    if not question or len(question) > MAX_QUESTION_LENGTH:
        raise PollError(f"Please enter a question (up to {MAX_QUESTION_LENGTH} characters).")
    if not MIN_OPTIONS <= len(cleaned) <= MAX_OPTIONS:
        raise PollError(f"A poll needs between {MIN_OPTIONS} and {MAX_OPTIONS} answers.")
    if any(len(o) > MAX_OPTION_LENGTH for o in cleaned):
        raise PollError(f"Answers can be at most {MAX_OPTION_LENGTH} characters.")
    if len({o.lower() for o in cleaned}) != len(cleaned):
        raise PollError("Each answer must be different.")

    poll = Poll(
        meeting_id=meeting_id,
        created_by_participant_id=participant_id,
        question=question,
        allow_multiple=allow_multiple,
        is_anonymous=anonymous,
        options=[PollOption(position=i, text=text) for i, text in enumerate(cleaned)],
    )
    db.add(poll)
    db.commit()
    return _load(db, poll.id, meeting_id)


def vote(db: Session, poll_id: int, meeting_id: int, participant_id: int, option_ids: list[int]) -> Poll:
    """Records one submission. Like Zoom, each participant answers a poll once."""
    poll = _load(db, poll_id, meeting_id)
    if poll.status != PollStatus.OPEN:
        raise PollError("This poll has ended.")
    valid = {o.id for o in poll.options}
    chosen = list(dict.fromkeys(option_ids))  # de-duplicate, keep order
    if not chosen or any(o not in valid for o in chosen):
        raise PollError("Please choose an answer.")
    if len(chosen) > 1 and not poll.allow_multiple:
        raise PollError("This poll only allows one answer.")
    if any(v.participant_id == participant_id for v in poll.votes):
        raise PollError("You have already answered this poll.")
    db.add_all(PollVote(poll_id=poll.id, option_id=o, participant_id=participant_id) for o in chosen)
    db.commit()
    db.expire(poll)
    return _load(db, poll_id, meeting_id)


def close_poll(db: Session, poll_id: int, meeting_id: int) -> Poll:
    poll = _load(db, poll_id, meeting_id)
    if poll.status == PollStatus.OPEN:
        poll.status = PollStatus.CLOSED
        poll.closed_at = utcnow()
        db.commit()
    return _load(db, poll_id, meeting_id)


def list_polls(db: Session, meeting_id: int) -> list[Poll]:
    return list(
        db.scalars(
            select(Poll)
            .where(Poll.meeting_id == meeting_id)
            .order_by(Poll.created_at)
            .options(selectinload(Poll.options), selectinload(Poll.votes).selectinload(PollVote.participant))
        ).all()
    )


def poll_view(poll: Poll, viewer_id: int | None = None, with_results: bool = False) -> PollView:
    """What one person sees: their own answers always; the tallies only when `with_results`
    (hosts during the poll, everyone once it has ended)."""
    counts: dict[int, int] = defaultdict(int)
    voters: dict[int, list[str]] = defaultdict(list)
    for v in poll.votes:
        counts[v.option_id] += 1
        voters[v.option_id].append(v.participant.display_name)
    show_names = with_results and not poll.is_anonymous
    return PollView(
        id=poll.id,
        question=poll.question,
        allow_multiple=poll.allow_multiple,
        is_anonymous=poll.is_anonymous,
        status=poll.status,
        created_at=poll.created_at,
        closed_at=poll.closed_at,
        options=[
            PollOptionView(
                id=o.id,
                text=o.text,
                votes=counts[o.id] if with_results else None,
                voters=voters[o.id] if show_names else None,
            )
            for o in poll.options
        ],
        total_voters=len({v.participant_id for v in poll.votes}) if with_results else None,
        my_votes=[v.option_id for v in poll.votes if v.participant_id == viewer_id],
    )
