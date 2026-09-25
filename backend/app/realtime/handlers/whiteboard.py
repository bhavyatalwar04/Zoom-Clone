"""Shared whiteboard.

Someone opens the whiteboard (it replaces the video stage for everyone), then anyone can draw.
A stroke is streamed while it is being drawn (`wb-stroke` with new points, `done` at the end) so
others see it live; finished strokes are stored, so late joiners and the meeting history get
the full board. Coordinates are normalised to 0..1 so every screen size draws the same picture.
"""

import re
from dataclasses import dataclass, field
from typing import Any

from .. import lifecycle, store
from ..state import Peer, Room, rooms
from ..store import db
from . import Ctx, on

KEY = "whiteboard"
TOOLS = {"pen", "highlighter", "line", "rect", "ellipse", "text"}
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_POINTS = 2000
MAX_TEXT = 200
MAX_ID = 64


@dataclass
class Board:
    open: bool = False
    opened_by: int | None = None
    opened_by_name: str | None = None
    strokes: dict[str, dict[str, Any]] = field(default_factory=dict)  # finished, in drawing order
    drawing: dict[str, dict[str, Any]] = field(default_factory=dict)  # in progress
    loaded: bool = False


async def _board(room: Room) -> Board:
    board = room.extras.setdefault(KEY, Board())
    if not board.loaded:  # first use in this process: pick up anything saved earlier
        board.loaded = True
        for stroke in await db(store.whiteboard_load, room.meeting_id):
            board.strokes.setdefault(stroke["id"], stroke)
    return board


def _public_state(board: Board) -> dict[str, Any]:
    return {"open": board.open, "opened_by": board.opened_by, "opened_by_name": board.opened_by_name}


async def welcome_whiteboard(room: Room, _peer: Peer) -> dict[str, Any]:
    board = await _board(room)
    return {"whiteboard": {**_public_state(board), "strokes": list(board.strokes.values())}}


lifecycle.welcome_extensions.append(welcome_whiteboard)


def _can_manage(ctx: Ctx, board: Board) -> bool:
    return ctx.peer.is_moderator or board.opened_by == ctx.peer.participant_id


@on("wb-open")
async def open_board(ctx: Ctx, msg: dict[str, Any]) -> None:
    board = await _board(ctx.room)
    if msg.get("open") is True:
        if not ctx.room.security.allow_share and not ctx.peer.is_moderator:
            return await ctx.error("SHARE_DISABLED", "The host has disabled sharing for participants.")
        board.open, board.opened_by, board.opened_by_name = True, ctx.peer.participant_id, ctx.peer.display_name
    elif msg.get("open") is False and _can_manage(ctx, board):
        board.open, board.opened_by, board.opened_by_name = False, None, None
    else:
        return
    await rooms.broadcast(ctx.room, {"type": "whiteboard-state", "whiteboard": _public_state(board)})


def _clean_points(raw: Any) -> list[list[float]] | None:
    if not isinstance(raw, list):
        return None
    points = []
    for p in raw:
        if not (isinstance(p, list) and len(p) == 2 and all(isinstance(v, int | float) for v in p)):
            return None
        points.append([round(min(max(float(p[0]), 0.0), 1.0), 4), round(min(max(float(p[1]), 0.0), 1.0), 4)])
    return points


@on("wb-stroke")
async def stroke(ctx: Ctx, msg: dict[str, Any]) -> None:
    board = await _board(ctx.room)
    data = msg.get("stroke")
    if not board.open or not isinstance(data, dict):
        return
    stroke_id, points = data.get("id"), _clean_points(data.get("points"))
    if not isinstance(stroke_id, str) or not 0 < len(stroke_id) <= MAX_ID or points is None or stroke_id in board.strokes:
        return

    current = board.drawing.get(stroke_id)
    if current is None:  # first chunk carries the style
        tool, color, width = data.get("tool"), data.get("color"), data.get("width")
        if tool not in TOOLS or not isinstance(color, str) or not COLOR_RE.match(color) or not isinstance(width, int | float):
            return
        current = board.drawing[stroke_id] = {
            "id": stroke_id,
            "tool": tool,
            "color": color,
            "width": min(max(float(width), 1.0), 40.0),
            "points": [],
            "by": ctx.peer.participant_id,
        }
        if tool == "text":
            current["text"] = str(data.get("text", ""))[:MAX_TEXT]
    if len(current["points"]) + len(points) > MAX_POINTS:
        points = points[: MAX_POINTS - len(current["points"])]
    current["points"].extend(points)

    done = msg.get("done") is True
    relay = {**current, "points": points}
    await rooms.broadcast(ctx.room, {"type": "wb-stroke", "stroke": relay, "done": done}, exclude=ctx.peer.participant_id)
    if done:
        finished = board.drawing.pop(stroke_id)
        board.strokes[stroke_id] = finished
        await db(store.whiteboard_save, ctx.meeting_id, ctx.peer.participant_id, finished)


@on("wb-erase")
async def erase(ctx: Ctx, msg: dict[str, Any]) -> None:
    board = await _board(ctx.room)
    ids = [i for i in msg.get("ids", []) if isinstance(i, str) and i in board.strokes] if isinstance(msg.get("ids"), list) else []
    if not board.open or not ids:
        return
    for stroke_id in ids:
        del board.strokes[stroke_id]
    await db(store.whiteboard_erase, ctx.meeting_id, ids)
    await rooms.broadcast(ctx.room, {"type": "wb-erase", "ids": ids}, exclude=ctx.peer.participant_id)


@on("wb-clear")
async def clear(ctx: Ctx, _msg: dict[str, Any]) -> None:
    board = await _board(ctx.room)
    if not _can_manage(ctx, board):
        return await ctx.error("NOT_ALLOWED", "Only the host or whoever opened the whiteboard can clear it.")
    board.strokes.clear()
    board.drawing.clear()
    await db(store.whiteboard_erase, ctx.meeting_id, None)
    await rooms.broadcast(ctx.room, {"type": "wb-clear"})
