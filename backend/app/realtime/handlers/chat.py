"""In-meeting chat (to everyone or privately) and live captions."""

from typing import Any

from .. import store
from ..state import breakout_room_id, rooms
from ..store import db
from . import Access, Ctx, on

MAX_CHAT_LENGTH = 1000
MAX_CAPTION_LENGTH = 500


@on("chat")
async def chat(ctx: Ctx, msg: dict[str, Any]) -> None:
    text = str(msg.get("text", "")).strip()[:MAX_CHAT_LENGTH]
    if not text:
        return

    recipient = None
    if msg.get("to") is not None:
        recipient = ctx.room.peers.get(msg["to"]) if isinstance(msg["to"], int) else None
        if recipient is None or recipient.group != ctx.peer.group or recipient is ctx.peer:
            return await ctx.error("RECIPIENT_UNAVAILABLE", "That participant is no longer in the meeting.")

    # With chat disabled, participants can still message the host / co-hosts privately (as in Zoom).
    if not ctx.room.security.allow_chat and not ctx.peer.is_moderator and not (recipient and recipient.is_moderator):
        return await ctx.error("CHAT_DISABLED", "The host has disabled chat.")

    saved = await db(
        store.save_chat,
        ctx.meeting_id,
        ctx.peer.participant_id,
        text,
        recipient.participant_id if recipient else None,
        breakout_room_id(ctx.peer.group),
    )
    event = {"type": "chat", "message": saved}
    if recipient is None:
        await rooms.broadcast(ctx.room, event, group=ctx.peer.group)
    else:
        await ctx.reply(event)
        await rooms.send(recipient, event)


@on("caption")
async def caption(ctx: Ctx, msg: dict[str, Any]) -> None:
    text = " ".join(str(msg.get("text", "")).split())[:MAX_CAPTION_LENGTH]
    if not ctx.room.captions_enabled or not text:
        return
    final = msg.get("final") is True
    event: dict[str, Any] = {
        "type": "caption",
        "from": ctx.peer.participant_id,
        "name": ctx.peer.display_name,
        "text": text,
        "final": final,
    }
    # Interim results are only relayed; final ones become part of the saved transcript.
    if final:
        event["segment"] = await db(store.save_transcript, ctx.meeting_id, ctx.peer.participant_id, text)
    await rooms.broadcast(ctx.room, event, group=ctx.peer.group)


@on("host:captions", Access.MODERATOR)
async def toggle_captions(ctx: Ctx, msg: dict[str, Any]) -> None:
    ctx.room.captions_enabled = msg.get("enabled") is True
    await rooms.broadcast(ctx.room, {"type": "captions-state", "enabled": ctx.room.captions_enabled})
