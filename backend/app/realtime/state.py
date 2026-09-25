"""In-memory registry of who is connected to which meeting room.

The media itself flows peer-to-peer over WebRTC; the server only relays signalling messages
(SDP offers/answers, ICE candidates) and meeting events. State lives in this process, so the
API must run as a single worker (see README).

Breakout rooms are modelled as *groups* inside one meeting room: every peer has a `group`
(None = the main session). Presence, signalling, chat, reactions and captions are scoped to
the peer's group, while meeting-wide events (security, end meeting, ...) go to everyone.
"""

import asyncio
import itertools
import logging
from dataclasses import asdict, dataclass, field
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)
_join_sequence = itertools.count()

MAIN = None  # the main session's group id
ALL_GROUPS = object()  # sentinel: send to every group

MODERATOR_ROLES = {"host", "co_host"}


def breakout_group(breakout_room_id: int) -> str:
    return f"breakout-{breakout_room_id}"


def breakout_room_id(group: str | None) -> int | None:
    """The breakout_rooms.id behind a group, or None for the main session."""
    if group and group.startswith("breakout-"):
        return int(group.removeprefix("breakout-"))
    return None


@dataclass
class Peer:
    participant_id: int
    display_name: str
    role: str  # host | co_host | attendee
    websocket: WebSocket
    audio: bool = True
    video: bool = True
    screen: bool = False
    hand_raised: bool = False
    feedback: str | None = None  # non-verbal feedback: yes | no | slower | faster | away
    group: str | None = MAIN  # breakout room id, None for the main session
    # Set when a moderator asks this person to unmute while unmuting is disabled.
    unmute_granted: bool = False
    # Monotonic join order, used to pick the next host when the host leaves.
    joined_seq: int = field(default_factory=lambda: next(_join_sequence))

    @property
    def is_host(self) -> bool:
        return self.role == "host"

    @property
    def is_moderator(self) -> bool:
        return self.role in MODERATOR_ROLES

    def public(self) -> dict[str, Any]:
        return {
            "id": self.participant_id,
            "display_name": self.display_name,
            "role": self.role,
            "audio": self.audio,
            "video": self.video,
            "screen": self.screen,
            "hand_raised": self.hand_raised,
            "feedback": self.feedback,
            "group": self.group,
        }


@dataclass
class Security:
    """The host's Security menu. `locked` and `waiting_room` are also persisted on the meeting."""

    locked: bool = False
    waiting_room: bool = False
    allow_share: bool = True
    allow_chat: bool = True
    allow_rename: bool = True
    allow_unmute: bool = True

    def to_dict(self) -> dict[str, bool]:
        return asdict(self)


@dataclass
class Room:
    code: str
    meeting_id: int
    peers: dict[int, Peer] = field(default_factory=dict)
    # People in the waiting room, not yet admitted (they have a socket but see nobody).
    waiting: dict[int, Peer] = field(default_factory=dict)
    admitted: set[int] = field(default_factory=set)
    security: Security = field(default_factory=Security)
    captions_enabled: bool = False
    spotlight_id: int | None = None
    # Extension points used by later features (polls, breakout rooms, whiteboard, recording).
    extras: dict[str, Any] = field(default_factory=dict)
    end_task: asyncio.Task | None = None

    def members(self, group: Any = ALL_GROUPS) -> list[Peer]:
        if group is ALL_GROUPS:
            return list(self.peers.values())
        return [p for p in self.peers.values() if p.group == group]

    def moderators(self) -> list[Peer]:
        return [p for p in self.peers.values() if p.is_moderator]


class RoomManager:
    def __init__(self) -> None:
        self._rooms: dict[str, Room] = {}

    def get(self, code: str) -> Room | None:
        return self._rooms.get(code)

    def get_or_create(self, code: str, meeting_id: int, security: Security) -> Room:
        room = self._rooms.get(code)
        if room is None:
            room = self._rooms[code] = Room(code=code, meeting_id=meeting_id, security=security)
        if room.end_task is not None:
            room.end_task.cancel()
            room.end_task = None
        return room

    def codes(self) -> set[str]:
        return set(self._rooms)

    def close_room(self, code: str) -> Room | None:
        room = self._rooms.pop(code, None)
        if room and room.end_task is not None:
            room.end_task.cancel()
        return room

    @staticmethod
    def add_peer(room: Room, peer: Peer) -> Peer | None:
        """Registers an admitted peer. Returns the previous connection of the same participant."""
        previous = room.peers.get(peer.participant_id)
        room.peers[peer.participant_id] = peer
        return previous

    @staticmethod
    def remove_peer(room: Room, participant_id: int, websocket: WebSocket | None = None) -> Peer | None:
        """Removes a peer (admitted or waiting). With `websocket`, only if it is still the active socket."""
        for registry in (room.peers, room.waiting):
            peer = registry.get(participant_id)
            if peer is not None and (websocket is None or peer.websocket is websocket):
                del registry[participant_id]
                return peer
        return None

    @staticmethod
    async def send(peer: Peer, message: dict[str, Any]) -> None:
        try:
            await peer.websocket.send_json(message)
        except Exception:  # the socket closed between lookup and send; its own handler cleans up
            logger.debug("Dropping message to disconnected peer %s", peer.participant_id)

    async def send_to(self, room: Room, participant_id: int, message: dict[str, Any]) -> bool:
        peer = room.peers.get(participant_id)
        if peer is None:
            return False
        await self.send(peer, message)
        return True

    async def broadcast(
        self, room: Room, message: dict[str, Any], *, exclude: int | None = None, group: Any = ALL_GROUPS
    ) -> None:
        targets = [p for p in room.members(group) if p.participant_id != exclude]
        await asyncio.gather(*(self.send(p, message) for p in targets))

    async def to_moderators(self, room: Room, message: dict[str, Any]) -> None:
        await asyncio.gather(*(self.send(p, message) for p in room.moderators()))


rooms = RoomManager()
