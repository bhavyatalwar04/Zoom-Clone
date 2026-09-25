"""Joining, waiting, leaving and ending: everything that changes who is in a room."""

import asyncio
import logging
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from fastapi import WebSocket

from ..config import get_settings
from . import store
from .state import Peer, Room, breakout_room_id, rooms
from .store import db

logger = logging.getLogger(__name__)

# Close codes in the private 4000-4999 range so the client can tell them apart.
CLOSE_REPLACED = 4000
CLOSE_REMOVED = 4003
CLOSE_ENDED = 4004
CLOSE_UNAUTHORIZED = 4401

# Features (polls, whiteboard, breakout rooms, ...) add their state to the welcome message here.
# An extension may be sync or async (e.g. when it reads the database).
WelcomeExtension = Callable[[Room, Peer], Any]
welcome_extensions: list[WelcomeExtension] = []
# ...and clean up after a peer leaves here.
LeaveHook = Callable[[Room, Peer], Any]
leave_hooks: list[LeaveHook] = []
# ...and react right after someone is admitted (e.g. send them back to their breakout room).
after_admit_hooks: list[LeaveHook] = []


async def close_socket(websocket: WebSocket, code: int) -> None:
    try:
        await websocket.close(code=code)
    except Exception:
        pass  # already closed


# --------------------------------------------------------------------------- waiting room


def waiting_list(room: Room) -> list[dict[str, Any]]:
    return [{"id": p.participant_id, "display_name": p.display_name} for p in room.waiting.values()]


async def notify_waiting_list(room: Room) -> None:
    await rooms.to_moderators(room, {"type": "waiting-list", "waiting": waiting_list(room)})


def must_wait(room: Room, peer: Peer) -> bool:
    return room.security.waiting_room and not peer.is_moderator and peer.participant_id not in room.admitted


async def put_in_waiting_room(room: Room, peer: Peer, title: str) -> None:
    previous = room.waiting.get(peer.participant_id)
    room.waiting[peer.participant_id] = peer
    if previous is not None and previous is not peer:
        await close_socket(previous.websocket, CLOSE_REPLACED)
    await rooms.send(peer, {"type": "waiting", "title": title})
    await notify_waiting_list(room)


# --------------------------------------------------------------------------- admission


async def admit(room: Room, peer: Peer) -> None:
    """Moves a peer into the meeting: welcome for them, `peer-joined` for everyone in their group.

    Ordering matters for WebRTC: the newcomer sends an offer to every peer listed in its
    welcome, and everyone told `peer-joined` waits for that offer. So the welcome's peer list
    and the `peer-joined` recipients must be exactly the same people. All the awaiting (database
    reads) therefore happens first, and joining the room + choosing both lists happens in one
    step with no `await` in between, so two people joining at the same moment can't interleave.
    """
    history = await db(store.load_history, room.meeting_id, peer.participant_id, breakout_room_id(peer.group))
    extras: dict[str, Any] = {}
    for extension in welcome_extensions:
        extra = extension(room, peer)
        extras.update(await extra if asyncio.iscoroutine(extra) else extra)

    # ---- no awaits from here until the messages are queued ----
    was_waiting = room.waiting.pop(peer.participant_id, None) is not None
    room.admitted.add(peer.participant_id)
    # "Allow participants to unmute themselves" is off: newcomers join muted.
    force_mute = peer.audio and not room.security.allow_unmute and not peer.is_moderator
    if force_mute:
        peer.audio = False
    previous = rooms.add_peer(room, peer)
    others = [p for p in room.members(peer.group) if p.participant_id != peer.participant_id]
    payload: dict[str, Any] = {
        "type": "welcome",
        "self": peer.public(),
        "peers": [p.public() for p in others],
        "messages": history["messages"],
        "transcript": history["transcript"],
        "captions_enabled": room.captions_enabled,
        "security": room.security.to_dict(),
        "spotlight": room.spotlight_id,
        "waiting": waiting_list(room) if peer.is_moderator else [],
        **extras,
    }
    joined = {"type": "peer-joined", "peer": peer.public()}
    await asyncio.gather(rooms.send(peer, payload), *(rooms.send(p, joined) for p in others))
    # ---------------------------------------------------------------

    if previous is not None and previous is not peer:
        await close_socket(previous.websocket, CLOSE_REPLACED)
    if force_mute:
        await rooms.send(peer, {"type": "force-mute"})
    if was_waiting:
        await notify_waiting_list(room)
    for hook in after_admit_hooks:
        result = hook(room, peer)
        if asyncio.iscoroutine(result):
            await result


async def move_to_group(room: Room, peer: Peer, group: str | None, info: dict[str, Any]) -> None:
    """Moves an admitted peer between the main session and a breakout room.

    Same rule as `admit`: the mover gets the peer list of the new group and offers to them,
    so that list and the `peer-joined` recipients are chosen together, with no await between.
    """
    if peer.group == group:
        return
    history = await db(store.load_history, room.meeting_id, peer.participant_id, breakout_room_id(group))

    # ---- no awaits from here until the messages are queued ----
    old_group = peer.group
    peer.group = group
    new_mates = [p for p in room.members(group) if p is not peer]
    old_mates = [p for p in room.members(old_group) if p is not peer]
    moved = {
        "type": "moved",
        "group": group,
        **info,
        "self": peer.public(),
        "peers": [p.public() for p in new_mates],
        "messages": history["messages"],
    }
    left = {"type": "peer-left", "id": peer.participant_id}
    joined = {"type": "peer-joined", "peer": peer.public()}
    await asyncio.gather(
        rooms.send(peer, moved),
        *(rooms.send(p, left) for p in old_mates),
        *(rooms.send(p, joined) for p in new_mates),
    )


# --------------------------------------------------------------------------- leaving


async def hand_over_host(room: Room) -> None:
    """If the host left without ending the meeting, a co-host (else the longest-present
    participant) becomes host, as in Zoom."""
    if not room.peers or any(p.is_host for p in room.peers.values()):
        return
    candidates = [p for p in room.peers.values() if p.role == "co_host"] or list(room.peers.values())
    successor = min(candidates, key=lambda p: p.joined_seq)
    successor.role = "host"
    await db(store.set_role, successor.participant_id, "host")
    await rooms.broadcast(room, {"type": "host-changed", "id": successor.participant_id})
    await rooms.send(successor, {"type": "waiting-list", "waiting": waiting_list(room)})


async def _after_leaving(room: Room, peer: Peer) -> None:
    """Shared cleanup once an admitted peer is gone (left, dropped or removed)."""
    await rooms.broadcast(room, {"type": "peer-left", "id": peer.participant_id}, group=peer.group)
    for hook in leave_hooks:
        result = hook(room, peer)
        if asyncio.iscoroutine(result):
            await result
    if room.spotlight_id == peer.participant_id:
        room.spotlight_id = None
        await rooms.broadcast(room, {"type": "spotlight", "id": None})


async def disconnect(room: Room, peer: Peer) -> None:
    was_waiting = room.waiting.get(peer.participant_id) is peer
    removed = rooms.remove_peer(room, peer.participant_id, peer.websocket)
    if removed is None:
        return  # replaced by a newer connection, or already removed by a moderator / meeting end
    await db(store.mark_left, peer.participant_id)
    if was_waiting:
        await notify_waiting_list(room)
    else:
        await _after_leaving(room, peer)
        if removed.is_host:
            await hand_over_host(room)
    if not room.peers and not room.waiting:
        room.end_task = asyncio.create_task(end_when_empty(room.code, room.meeting_id))


async def remove_participant(room: Room, participant_id: int) -> bool:
    """Moderator removes someone from the meeting or the waiting room. They cannot rejoin this session."""
    was_waiting = participant_id in room.waiting
    peer = rooms.remove_peer(room, participant_id)
    if peer is None:
        return False
    room.admitted.discard(participant_id)
    await db(store.mark_left, participant_id, True)
    await rooms.send(peer, {"type": "removed"})
    await close_socket(peer.websocket, CLOSE_REMOVED)
    if was_waiting:
        await notify_waiting_list(room)
    else:
        await _after_leaving(room, peer)
    return True


# --------------------------------------------------------------------------- ending


async def end_for_everyone(room: Room) -> None:
    rooms.close_room(room.code)
    await db(store.end_meeting, room.meeting_id)
    everyone = [*room.peers.values(), *room.waiting.values()]
    await asyncio.gather(*(rooms.send(p, {"type": "meeting-ended"}) for p in everyone))
    await asyncio.gather(*(close_socket(p.websocket, CLOSE_ENDED) for p in everyone))


async def end_when_empty(code: str, meeting_id: int) -> None:
    """Ends the meeting if nobody (re)joins within the grace period (covers page refreshes)."""
    await asyncio.sleep(get_settings().empty_room_grace_seconds)
    room = rooms.get(code)
    if room is None or room.peers or room.waiting:
        return
    room.end_task = None  # we are that task; don't let close_room cancel us
    rooms.close_room(code)
    await db(store.end_meeting, meeting_id)


async def run_abandoned_meeting_sweeper() -> None:
    """Background task: ends 'live' meetings that nobody is connected to.

    Covers a tab closing between the join request and the WebSocket connecting, and a server
    restart wiping the in-memory rooms. Started from the app lifespan.
    """
    settings = get_settings()
    grace = timedelta(seconds=settings.abandoned_meeting_seconds)
    while True:
        await asyncio.sleep(settings.sweep_interval_seconds)
        try:
            ended = await db(store.end_abandoned, rooms.codes(), grace)
            if ended:
                logger.info("Ended abandoned meetings: %s", ", ".join(ended))
        except Exception:
            logger.exception("Abandoned meeting sweep failed")

