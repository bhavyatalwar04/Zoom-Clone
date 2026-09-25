"""Breakout rooms.

The host creates N rooms and assigns people (automatically or by hand), then opens them.
Opening moves every assigned participant into their room's *group*: they drop their WebRTC
connections to the main session and connect to the people in their room (see
`lifecycle.move_to_group`). Chat, reactions and captions are scoped to the group. Closing the
rooms counts down and brings everyone back to the main session.
"""

import asyncio
from dataclasses import dataclass, field
from typing import Any

from .. import lifecycle, store
from ..state import MAIN, Peer, Room, breakout_group, rooms
from ..store import db
from . import Access, Ctx, on

KEY = "breakout"
MAX_ROOMS = 20
CLOSE_COUNTDOWN_SECONDS = 10
MAX_BROADCAST_LENGTH = 300


@dataclass
class Breakouts:
    names: list[str]
    # participant_id -> room position (the host's plan; applied when rooms open)
    assignments: dict[int, int] = field(default_factory=dict)
    # breakout_rooms.id per position, once opened
    room_ids: list[int] = field(default_factory=list)
    # participant_id -> breakout_assignments.id while they are in a room
    visits: dict[int, int] = field(default_factory=dict)
    closing: asyncio.Task | None = None

    @property
    def is_open(self) -> bool:
        return bool(self.room_ids)

    def group(self, position: int) -> str:
        return breakout_group(self.room_ids[position])

    def position_of(self, group: str | None) -> int | None:
        return next((i for i in range(len(self.room_ids)) if self.group(i) == group), None)


def _get(room: Room) -> Breakouts | None:
    return room.extras.get(KEY)


def state(room: Room) -> dict[str, Any]:
    """The breakout picture everyone sees: rooms, who is (or will be) in them, open or not."""
    plan = _get(room)
    if plan is None:
        return {"breakout": None}

    def members(position: int) -> list[dict[str, Any]]:
        if plan.is_open:
            people = [p for p in room.peers.values() if p.group == plan.group(position)]
        else:
            people = [room.peers[pid] for pid, pos in plan.assignments.items() if pos == position and pid in room.peers]
        return [{"id": p.participant_id, "display_name": p.display_name} for p in people]

    return {
        "breakout": {
            "open": plan.is_open,
            "closing": plan.closing is not None,
            "rooms": [
                {
                    "position": i,
                    "group": plan.group(i) if plan.is_open else None,
                    "name": name,
                    "members": members(i),
                    "assigned": [pid for pid, pos in plan.assignments.items() if pos == i],
                }
                for i, name in enumerate(plan.names)
            ],
        }
    }


async def _broadcast_state(room: Room) -> None:
    await rooms.broadcast(room, {"type": "breakout-state", **state(room)})


async def _move(room: Room, peer: Peer, position: int | None) -> None:
    """Moves a peer into room `position` (None = back to the main session), recording the visit."""
    plan = _get(room)
    if plan is None or not plan.is_open:
        return
    target = MAIN if position is None else plan.group(position)
    if peer.group == target:
        return
    if (visit := plan.visits.pop(peer.participant_id, None)) is not None:
        await db(store.breakout_exit, visit)
    if position is not None:
        plan.visits[peer.participant_id] = await db(store.breakout_enter, plan.room_ids[position], peer.participant_id)
    name = plan.names[position] if position is not None else None
    await lifecycle.move_to_group(room, peer, target, {"room_name": name})


# --------------------------------------------------------------------------- host controls


@on("host:breakout-create", Access.HOST)
async def create(ctx: Ctx, msg: dict[str, Any]) -> None:
    plan = _get(ctx.room)
    if plan is not None and plan.is_open:
        return await ctx.error("BREAKOUT_OPEN", "Close the breakout rooms before creating new ones.")
    count = msg.get("count")
    if not isinstance(count, int) or not 1 <= count <= MAX_ROOMS:
        return await ctx.error("INVALID_BREAKOUT", f"Choose between 1 and {MAX_ROOMS} rooms.")
    plan = Breakouts(names=[f"Room {i + 1}" for i in range(count)])
    if msg.get("auto") is True:
        attendees = sorted(
            (p for p in ctx.room.peers.values() if not p.is_moderator), key=lambda p: p.joined_seq
        )
        plan.assignments = {p.participant_id: i % count for i, p in enumerate(attendees)}
    ctx.room.extras[KEY] = plan
    await _broadcast_state(ctx.room)


@on("host:breakout-assign", Access.HOST)
async def assign(ctx: Ctx, msg: dict[str, Any]) -> None:
    """Assign (or with position None, unassign) someone. While rooms are open they move at once."""
    plan, target = _get(ctx.room), msg.get("target")
    position = msg.get("position")
    if plan is None or not isinstance(target, int) or target not in ctx.room.peers:
        return
    if position is not None and (not isinstance(position, int) or not 0 <= position < len(plan.names)):
        return
    if position is None:
        plan.assignments.pop(target, None)
    else:
        plan.assignments[target] = position
    if plan.is_open:
        await _move(ctx.room, ctx.room.peers[target], position)
    await _broadcast_state(ctx.room)


@on("host:breakout-open", Access.HOST)
async def open_rooms(ctx: Ctx, _msg: dict[str, Any]) -> None:
    plan = _get(ctx.room)
    if plan is None or plan.is_open:
        return
    plan.room_ids = await db(store.breakout_open, ctx.meeting_id, plan.names)
    for pid, position in list(plan.assignments.items()):
        peer = ctx.room.peers.get(pid)
        if peer is not None and peer.group == MAIN:
            await _move(ctx.room, peer, position)
    await _broadcast_state(ctx.room)


async def _close_after_countdown(room: Room) -> None:
    await asyncio.sleep(CLOSE_COUNTDOWN_SECONDS)
    plan = _get(room)
    if plan is None:
        return
    for peer in [p for p in room.peers.values() if p.group != MAIN]:
        await _move(room, peer, None)
    await db(store.breakout_close, plan.room_ids)
    plan.room_ids, plan.visits, plan.closing = [], {}, None
    await _broadcast_state(room)


@on("host:breakout-close", Access.HOST)
async def close_rooms(ctx: Ctx, _msg: dict[str, Any]) -> None:
    plan = _get(ctx.room)
    if plan is None or not plan.is_open or plan.closing is not None:
        return
    plan.closing = asyncio.create_task(_close_after_countdown(ctx.room))
    await rooms.broadcast(ctx.room, {"type": "breakout-closing", "seconds": CLOSE_COUNTDOWN_SECONDS})
    await _broadcast_state(ctx.room)


@on("host:breakout-broadcast", Access.HOST)
async def broadcast_message(ctx: Ctx, msg: dict[str, Any]) -> None:
    text = " ".join(str(msg.get("text", "")).split())[:MAX_BROADCAST_LENGTH]
    if text:
        await rooms.broadcast(ctx.room, {"type": "breakout-message", "text": text, "from": ctx.peer.display_name})


# --------------------------------------------------------------------------- participants


@on("breakout-join")
async def join(ctx: Ctx, msg: dict[str, Any]) -> None:
    """Hosts / co-hosts can visit any room; participants can go back to their own."""
    plan, position = _get(ctx.room), msg.get("position")
    if plan is None or not plan.is_open or not isinstance(position, int) or not 0 <= position < len(plan.names):
        return
    if not ctx.peer.is_moderator and plan.assignments.get(ctx.peer.participant_id) != position:
        return await ctx.error("NOT_ALLOWED", "You can only join the breakout room you were assigned to.")
    await _move(ctx.room, ctx.peer, position)
    await _broadcast_state(ctx.room)


@on("breakout-leave")
async def leave(ctx: Ctx, _msg: dict[str, Any]) -> None:
    await _move(ctx.room, ctx.peer, None)
    await _broadcast_state(ctx.room)


@on("breakout-help")
async def ask_for_help(ctx: Ctx, _msg: dict[str, Any]) -> None:
    plan = _get(ctx.room)
    position = plan.position_of(ctx.peer.group) if plan else None
    if position is None:
        return
    await rooms.to_moderators(
        ctx.room,
        {"type": "breakout-help", "from": ctx.peer.display_name, "position": position, "room_name": plan.names[position]},
    )


# --------------------------------------------------------------------------- lifecycle hooks


async def _after_admit(room: Room, peer: Peer) -> None:
    """Someone reconnecting while rooms are open goes straight back to their room."""
    plan = _get(room)
    if plan is not None and plan.is_open and (position := plan.assignments.get(peer.participant_id)) is not None:
        await _move(room, peer, position)
    if plan is not None:
        await rooms.send(peer, {"type": "breakout-state", **state(room)})


async def _on_leave(room: Room, peer: Peer) -> None:
    plan = _get(room)
    if plan is None:
        return
    if (visit := plan.visits.pop(peer.participant_id, None)) is not None:
        await db(store.breakout_exit, visit)
    await _broadcast_state(room)


lifecycle.after_admit_hooks.append(_after_admit)
lifecycle.leave_hooks.append(_on_leave)
