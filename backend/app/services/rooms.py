"""In-memory registry of who is connected to which meeting room.

The media itself flows peer-to-peer over WebRTC; the server only relays signalling messages
(SDP offers/answers, ICE candidates) and meeting events (chat, mute, reactions, host actions).
State lives in this process, so the API must run as a single worker (see README).
"""

import asyncio
import itertools
import logging
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)
_join_sequence = itertools.count()


@dataclass
class Peer:
    participant_id: int
    display_name: str
    role: str
    websocket: WebSocket
    audio: bool = True
    video: bool = True
    screen: bool = False
    hand_raised: bool = False
    # Monotonic join order, used to pick the next host when the host leaves.
    joined_seq: int = field(default_factory=lambda: next(_join_sequence))

    @property
    def is_host(self) -> bool:
        return self.role == "host"

    def public(self) -> dict[str, Any]:
        return {
            "id": self.participant_id,
            "display_name": self.display_name,
            "role": self.role,
            "audio": self.audio,
            "video": self.video,
            "screen": self.screen,
            "hand_raised": self.hand_raised,
        }


@dataclass
class Room:
    code: str
    meeting_id: int
    peers: dict[int, Peer] = field(default_factory=dict)
    end_task: asyncio.Task | None = None
    # Live captions are switched on for everyone by the host.
    captions_enabled: bool = False


class RoomManager:
    def __init__(self) -> None:
        self._rooms: dict[str, Room] = {}

    def get(self, code: str) -> Room | None:
        return self._rooms.get(code)

    def codes(self) -> set[str]:
        return set(self._rooms)

    def add_peer(self, code: str, meeting_id: int, peer: Peer) -> Peer | None:
        """Registers a peer. Returns the previous connection of the same participant, if any."""
        room = self._rooms.setdefault(code, Room(code=code, meeting_id=meeting_id))
        if room.end_task is not None:
            room.end_task.cancel()
            room.end_task = None
        previous = room.peers.get(peer.participant_id)
        room.peers[peer.participant_id] = peer
        return previous

    def remove_peer(self, code: str, participant_id: int, websocket: WebSocket | None = None) -> Peer | None:
        """Removes a peer; when `websocket` is given only removes it if it is still the active socket."""
        room = self._rooms.get(code)
        if room is None:
            return None
        peer = room.peers.get(participant_id)
        if peer is None or (websocket is not None and peer.websocket is not websocket):
            return None
        del room.peers[participant_id]
        return peer

    def close_room(self, code: str) -> Room | None:
        room = self._rooms.pop(code, None)
        if room and room.end_task is not None:
            room.end_task.cancel()
        return room

    async def send(self, peer: Peer, message: dict[str, Any]) -> None:
        try:
            await peer.websocket.send_json(message)
        except Exception:  # the socket closed between lookup and send; its own handler cleans up
            logger.debug("Dropping message to disconnected peer %s", peer.participant_id)

    async def send_to(self, code: str, participant_id: int, message: dict[str, Any]) -> bool:
        room = self._rooms.get(code)
        peer = room.peers.get(participant_id) if room else None
        if peer is None:
            return False
        await self.send(peer, message)
        return True

    async def broadcast(self, code: str, message: dict[str, Any], exclude: int | None = None) -> None:
        room = self._rooms.get(code)
        if room is None:
            return
        targets = [p for pid, p in room.peers.items() if pid != exclude]
        await asyncio.gather(*(self.send(p, message) for p in targets))


rooms = RoomManager()
