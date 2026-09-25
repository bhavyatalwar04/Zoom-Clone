"""'Record on this computer'. The recording itself happens in the recorder's browser; the server
records who recorded and when, and shows everyone the red Recording indicator (as Zoom does)."""

from typing import Any

from .. import lifecycle, store
from ..state import Peer, Room, rooms
from ..store import db
from . import Access, Ctx, on

KEY = "recordings"  # room.extras[KEY]: participant_id -> recording row id


def _active(room: Room) -> dict[int, int]:
    return room.extras.setdefault(KEY, {})


def recording_state(room: Room) -> dict[str, Any]:
    names = [room.peers[pid].display_name for pid in _active(room) if pid in room.peers]
    return {"recording": {"active": bool(names), "by": names}}


async def _broadcast_state(room: Room) -> None:
    await rooms.broadcast(room, {"type": "recording-state", **recording_state(room)})


async def _stop(room: Room, peer: Peer) -> None:
    recording_id = _active(room).pop(peer.participant_id, None)
    if recording_id is not None:
        await db(store.recording_stop, recording_id)
        await _broadcast_state(room)


lifecycle.welcome_extensions.append(lambda room, _peer: recording_state(room))
lifecycle.leave_hooks.append(_stop)  # leaving (or being removed) stops your recording


@on("host:recording", Access.MODERATOR)
async def toggle(ctx: Ctx, msg: dict[str, Any]) -> None:
    active = _active(ctx.room)
    if msg.get("active") is True and ctx.peer.participant_id not in active:
        active[ctx.peer.participant_id] = await db(store.recording_start, ctx.meeting_id, ctx.peer.participant_id)
        await _broadcast_state(ctx.room)
    elif msg.get("active") is False:
        await _stop(ctx.room, ctx.peer)
