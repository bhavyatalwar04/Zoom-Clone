"""Signalling, my own media state, and lightweight participant signals."""

from typing import Any

from ...models import ActivityKind
from .. import store
from ..state import rooms
from ..store import db
from . import Ctx, on

ALLOWED_REACTIONS = {"👏", "👍", "❤️", "😂", "😮", "🎉"}
ALLOWED_FEEDBACK = {"yes", "no", "slower", "faster", "away"}
# Clients report talk time every few seconds; anything larger is not a plausible report.
MAX_TALK_REPORT_MS = 15_000
MAX_NAME_LENGTH = 80


async def broadcast_update(ctx: Ctx, *, include_self: bool = False) -> None:
    await rooms.broadcast(
        ctx.room,
        {"type": "peer-updated", "peer": ctx.peer.public()},
        exclude=None if include_self else ctx.peer.participant_id,
        group=ctx.peer.group,
    )


@on("ping")
async def ping(ctx: Ctx, _msg: dict[str, Any]) -> None:
    await ctx.reply({"type": "pong"})


@on("signal")
async def signal(ctx: Ctx, msg: dict[str, Any]) -> None:
    """Relays an SDP offer/answer or ICE candidate to one peer in the same group."""
    target = ctx.room.peers.get(msg.get("to")) if isinstance(msg.get("to"), int) else None
    if target is not None and target.group == ctx.peer.group:
        await rooms.send(target, {"type": "signal", "from": ctx.peer.participant_id, "data": msg.get("data")})


@on("media")
async def media(ctx: Ctx, msg: dict[str, Any]) -> None:
    peer, security = ctx.peer, ctx.room.security
    # Security menu: participants may be blocked from sharing or unmuting.
    if msg.get("screen") is True and not peer.screen and not security.allow_share and not peer.is_moderator:
        await ctx.reply({"type": "force-stop-share"})
        msg = {k: v for k, v in msg.items() if k != "screen"}
    if msg.get("audio") is True and not peer.audio and not security.allow_unmute and not peer.is_moderator:
        if not peer.unmute_granted:
            await ctx.reply({"type": "force-mute"})
            msg = {k: v for k, v in msg.items() if k != "audio"}
        peer.unmute_granted = False

    started_sharing = msg.get("screen") is True and not peer.screen
    for attr in ("audio", "video", "screen"):
        if isinstance(msg.get(attr), bool):
            setattr(peer, attr, msg[attr])
    await broadcast_update(ctx)
    if started_sharing:
        await db(store.log_activity, ctx.meeting_id, peer.participant_id, ActivityKind.SCREEN_SHARE)


@on("hand")
async def hand(ctx: Ctx, msg: dict[str, Any]) -> None:
    raised = bool(msg.get("raised"))
    newly_raised = raised and not ctx.peer.hand_raised
    ctx.peer.hand_raised = raised
    await broadcast_update(ctx)
    if newly_raised:
        await db(store.log_activity, ctx.meeting_id, ctx.peer.participant_id, ActivityKind.HAND_RAISE)


@on("feedback")
async def feedback(ctx: Ctx, msg: dict[str, Any]) -> None:
    """Non-verbal feedback (yes / no / go slower / go faster / I'm away), or None to clear it."""
    value = msg.get("value")
    if value is not None and value not in ALLOWED_FEEDBACK:
        return
    ctx.peer.feedback = value
    await broadcast_update(ctx)


@on("reaction")
async def reaction(ctx: Ctx, msg: dict[str, Any]) -> None:
    emoji = msg.get("emoji")
    if emoji not in ALLOWED_REACTIONS:
        return
    await rooms.broadcast(ctx.room, {"type": "reaction", "from": ctx.peer.participant_id, "emoji": emoji}, group=ctx.peer.group)
    await db(store.log_activity, ctx.meeting_id, ctx.peer.participant_id, ActivityKind.REACTION, emoji)


@on("talk-time")
async def talk_time(ctx: Ctx, msg: dict[str, Any]) -> None:
    ms = msg.get("ms")
    if isinstance(ms, int) and 0 < ms <= MAX_TALK_REPORT_MS:
        await db(store.add_talk_time, ctx.peer.participant_id, ms)


def clean_name(value: Any) -> str | None:
    name = " ".join(str(value or "").split())[:MAX_NAME_LENGTH]
    return name or None


@on("rename")
async def rename_self(ctx: Ctx, msg: dict[str, Any]) -> None:
    if not ctx.room.security.allow_rename and not ctx.peer.is_moderator:
        return await ctx.error("RENAME_DISABLED", "The host has disabled renaming.")
    name = clean_name(msg.get("name"))
    if name is None:
        return
    ctx.peer.display_name = name
    await db(store.rename_participant, ctx.peer.participant_id, name)
    await broadcast_update(ctx, include_self=True)
