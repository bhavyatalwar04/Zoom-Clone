"""Host and co-host controls: muting, removing, roles, spotlight, security and the waiting room."""

from typing import Any

from .. import lifecycle, store
from ..state import rooms
from ..store import db
from . import Access, Ctx, on, target_peer
from .basics import clean_name

SECURITY_FLAGS = ("locked", "waiting_room", "allow_share", "allow_chat", "allow_rename", "allow_unmute")


async def _announce(ctx: Ctx, *peers) -> None:
    """Tell everyone (including the people concerned) about server-side changes to participants."""
    for peer in peers:
        await rooms.broadcast(ctx.room, {"type": "peer-updated", "peer": peer.public()}, group=peer.group)


# --------------------------------------------------------------------------- audio / video


@on("host:mute-all", Access.MODERATOR)
async def mute_all(ctx: Ctx, _msg: dict[str, Any]) -> None:
    for peer in ctx.room.members():
        if not peer.is_moderator:
            await rooms.send(peer, {"type": "force-mute"})


@on("host:mute", Access.MODERATOR)
async def mute(ctx: Ctx, msg: dict[str, Any]) -> None:
    if target := target_peer(ctx, msg):
        await rooms.send(target, {"type": "force-mute"})


@on("host:ask-unmute", Access.MODERATOR)
async def ask_unmute(ctx: Ctx, msg: dict[str, Any]) -> None:
    if target := target_peer(ctx, msg):
        target.unmute_granted = True  # allowed even if "unmute themselves" is off
        await rooms.send(target, {"type": "ask-unmute"})


@on("host:stop-video", Access.MODERATOR)
async def stop_video(ctx: Ctx, msg: dict[str, Any]) -> None:
    if target := target_peer(ctx, msg):
        await rooms.send(target, {"type": "force-stop-video"})


@on("host:lower-hands", Access.MODERATOR)
async def lower_all_hands(ctx: Ctx, _msg: dict[str, Any]) -> None:
    raised = [p for p in ctx.room.members() if p.hand_raised]
    for peer in raised:
        peer.hand_raised = False
    await _announce(ctx, *raised)


# --------------------------------------------------------------------------- participants


@on("host:remove", Access.MODERATOR)
async def remove(ctx: Ctx, msg: dict[str, Any]) -> None:
    target = msg.get("target")
    if isinstance(target, int) and target != ctx.peer.participant_id:
        room_peer = ctx.room.peers.get(target)
        if room_peer is not None and room_peer.is_host:
            return await ctx.error("NOT_ALLOWED", "The host cannot be removed.")
        await lifecycle.remove_participant(ctx.room, target)


@on("host:rename", Access.MODERATOR)
async def rename(ctx: Ctx, msg: dict[str, Any]) -> None:
    target, name = target_peer(ctx, msg), clean_name(msg.get("name"))
    if target is None or name is None:
        return
    target.display_name = name
    await db(store.rename_participant, target.participant_id, name)
    await _announce(ctx, target)


@on("host:make-host", Access.HOST)
async def make_host(ctx: Ctx, msg: dict[str, Any]) -> None:
    """Hand the meeting over: the target becomes host and the current host a participant."""
    target = target_peer(ctx, msg)
    if target is None or target is ctx.peer:
        return
    target.role, ctx.peer.role = "host", "attendee"
    await db(store.set_role, target.participant_id, "host")
    await db(store.set_role, ctx.peer.participant_id, "attendee")
    await _announce(ctx, target, ctx.peer)
    await rooms.send(target, {"type": "waiting-list", "waiting": lifecycle.waiting_list(ctx.room)})


@on("host:make-cohost", Access.HOST)
async def make_cohost(ctx: Ctx, msg: dict[str, Any]) -> None:
    target = target_peer(ctx, msg)
    if target is None or target.is_moderator:
        return
    target.role = "co_host"
    await db(store.set_role, target.participant_id, "co_host")
    await _announce(ctx, target)
    await rooms.send(target, {"type": "waiting-list", "waiting": lifecycle.waiting_list(ctx.room)})


@on("host:revoke-cohost", Access.HOST)
async def revoke_cohost(ctx: Ctx, msg: dict[str, Any]) -> None:
    target = target_peer(ctx, msg)
    if target is None or target.role != "co_host":
        return
    target.role = "attendee"
    await db(store.set_role, target.participant_id, "attendee")
    await _announce(ctx, target)


@on("host:spotlight", Access.MODERATOR)
async def spotlight(ctx: Ctx, msg: dict[str, Any]) -> None:
    """Spotlight one video as the main view for everyone (target None removes the spotlight)."""
    target = target_peer(ctx, msg)
    ctx.room.spotlight_id = target.participant_id if target else None
    await rooms.broadcast(ctx.room, {"type": "spotlight", "id": ctx.room.spotlight_id})


# --------------------------------------------------------------------------- security & waiting room


@on("host:security", Access.MODERATOR)
async def security(ctx: Ctx, msg: dict[str, Any]) -> None:
    changes = {flag: msg[flag] for flag in SECURITY_FLAGS if isinstance(msg.get(flag), bool)}
    if not changes:
        return
    for flag, value in changes.items():
        setattr(ctx.room.security, flag, value)
    await db(lambda: store.set_meeting_flags(ctx.meeting_id, **changes))
    await rooms.broadcast(ctx.room, {"type": "security", "security": ctx.room.security.to_dict()})
    # Turning the waiting room off lets everyone who was waiting straight in (Zoom's behaviour).
    if changes.get("waiting_room") is False:
        for peer in list(ctx.room.waiting.values()):
            await lifecycle.admit(ctx.room, peer)


@on("host:admit", Access.MODERATOR)
async def admit(ctx: Ctx, msg: dict[str, Any]) -> None:
    peer = ctx.room.waiting.get(msg.get("target")) if isinstance(msg.get("target"), int) else None
    if peer is not None:
        await lifecycle.admit(ctx.room, peer)


@on("host:admit-all", Access.MODERATOR)
async def admit_all(ctx: Ctx, _msg: dict[str, Any]) -> None:
    for peer in list(ctx.room.waiting.values()):
        await lifecycle.admit(ctx.room, peer)


@on("host:end", Access.HOST)
async def end_meeting(ctx: Ctx, _msg: dict[str, Any]) -> None:
    await lifecycle.end_for_everyone(ctx.room)
