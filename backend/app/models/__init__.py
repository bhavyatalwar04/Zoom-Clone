"""Database schema, one module per area.

    users ──< meetings (host_id)                    meeting.py
    meetings ──< meeting_invitees
    meetings ──< meeting_participants               participant.py  (one row per attendance)
    meeting_participants ──< chat_messages          engagement.py   (recipient set = private message)
    meeting_participants ──< transcript_segments                    (live captions)
    meeting_participants ──< meeting_activities                     (reactions, raised hands, shares)
    meeting_participants ──< meeting_recordings                     (local recordings)
    meetings ──< polls ──< poll_options             polls.py
    polls ──< poll_votes >── meeting_participants

Everything that happens in a meeting hangs off the participant who did it, which is what the
post-meeting insights aggregate over.
"""

from .base import db_enum
from .engagement import ActivityKind, ChatMessage, MeetingActivity, MeetingRecording, TranscriptSegment
from .meeting import Meeting, MeetingInvitee, MeetingStatus, MeetingType
from .participant import MeetingParticipant, ParticipantRole
from .polls import Poll, PollOption, PollStatus, PollVote
from .user import User

__all__ = [
    "ActivityKind",
    "ChatMessage",
    "Meeting",
    "MeetingActivity",
    "MeetingInvitee",
    "MeetingParticipant",
    "MeetingRecording",
    "MeetingStatus",
    "MeetingType",
    "ParticipantRole",
    "Poll",
    "PollOption",
    "PollStatus",
    "PollVote",
    "TranscriptSegment",
    "User",
    "db_enum",
]
