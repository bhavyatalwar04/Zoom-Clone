"""Message handler registry.

Every client -> server message type is handled by one function, registered with `@on(...)`
together with who is allowed to send it. `dispatch` enforces that before calling the handler,
so individual handlers never re-check roles.

Handlers are grouped by feature in the sibling modules; importing this package registers all
of them.
"""

import enum
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from ..state import Peer, Room, rooms


class Access(enum.Enum):
    ANYONE = "anyone"
    MODERATOR = "moderator"  # host or co-host
    HOST = "host"


@dataclass
class Ctx:
    """The room and the peer a message came from."""

    room: Room
    peer: Peer

    @property
    def meeting_id(self) -> int:
        return self.room.meeting_id

    async def reply(self, message: dict[str, Any]) -> None:
        await rooms.send(self.peer, message)

    async def error(self, code: str, message: str) -> None:
        await self.reply({"type": "error", "code": code, "message": message})


Handler = Callable[[Ctx, dict[str, Any]], Awaitable[None]]
_registry: dict[str, tuple[Access, Handler]] = {}


def on(kind: str, access: Access = Access.ANYONE) -> Callable[[Handler], Handler]:
    def register(fn: Handler) -> Handler:
        if kind in _registry:
            raise ValueError(f"Duplicate handler for {kind!r}")
        _registry[kind] = (access, fn)
        return fn

    return register


async def dispatch(ctx: Ctx, message: dict[str, Any]) -> None:
    entry = _registry.get(str(message.get("type")))
    if entry is None:
        return
    access, handler = entry
    if access is Access.MODERATOR and not ctx.peer.is_moderator:
        return await ctx.error("NOT_HOST", "Only the host or a co-host can do that.")
    if access is Access.HOST and not ctx.peer.is_host:
        return await ctx.error("NOT_HOST", "Only the host can do that.")
    await handler(ctx, message)


def target_peer(ctx: Ctx, message: dict[str, Any]) -> Peer | None:
    """The admitted peer a moderation message is aimed at, if it exists."""
    target = message.get("target")
    return ctx.room.peers.get(target) if isinstance(target, int) else None


# Register every feature's handlers (import for side effects).
from . import basics, breakout, chat, moderation, polls, recording, whiteboard  # noqa: E402,F401
