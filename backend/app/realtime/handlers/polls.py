"""Live polls: the host launches a question, participants answer, results are shared at the end.

Hosts and co-hosts see live tallies; participants see the results once the poll ends.
"""

from typing import Any

from ...errors import AppError
from ...models import PollStatus
from ...services.polls import poll_view
from .. import lifecycle, store
from ..state import Peer, Room, rooms
from ..store import db
from . import Access, Ctx, on


def _view(poll, peer: Peer) -> dict[str, Any]:
    with_results = peer.is_moderator or poll.status == PollStatus.CLOSED
    return poll_view(poll, peer.participant_id, with_results).model_dump(mode="json")


async def _send_poll(room: Room, poll, only_moderators: bool = False) -> None:
    """Everyone gets their own view of the poll (their answers, results if allowed)."""
    for peer in room.members():
        if only_moderators and not peer.is_moderator:
            continue
        await rooms.send(peer, {"type": "poll", "poll": _view(poll, peer)})


async def welcome_polls(room: Room, peer: Peer) -> dict[str, Any]:
    polls = await db(store.polls_for, room.meeting_id)
    return {"polls": [_view(p, peer) for p in polls]}


lifecycle.welcome_extensions.append(welcome_polls)


@on("host:poll-launch", Access.MODERATOR)
async def launch(ctx: Ctx, msg: dict[str, Any]) -> None:
    try:
        poll = await db(store.poll_create, ctx.meeting_id, ctx.peer.participant_id, msg)
    except AppError as err:
        return await ctx.error(err.code, err.message)
    await _send_poll(ctx.room, poll)


@on("poll-vote")
async def vote(ctx: Ctx, msg: dict[str, Any]) -> None:
    poll_id, option_ids = msg.get("poll_id"), msg.get("option_ids")
    if not isinstance(poll_id, int) or not isinstance(option_ids, list) or not all(isinstance(o, int) for o in option_ids):
        return await ctx.error("INVALID_POLL", "Please choose an answer.")
    try:
        poll = await db(store.poll_vote, ctx.meeting_id, ctx.peer.participant_id, poll_id, option_ids)
    except AppError as err:
        return await ctx.error(err.code, err.message)
    await ctx.reply({"type": "poll", "poll": _view(poll, ctx.peer)})
    await _send_poll(ctx.room, poll, only_moderators=True)  # live tallies for the hosts


@on("host:poll-end", Access.MODERATOR)
async def end(ctx: Ctx, msg: dict[str, Any]) -> None:
    if not isinstance(msg.get("poll_id"), int):
        return
    try:
        poll = await db(store.poll_close, ctx.meeting_id, msg["poll_id"])
    except AppError as err:
        return await ctx.error(err.code, err.message)
    await _send_poll(ctx.room, poll)  # results are shared with everyone when a poll ends
