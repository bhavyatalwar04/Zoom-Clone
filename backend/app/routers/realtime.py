"""WebSocket endpoint: WebRTC signalling relay + live meeting events.

Client -> server messages (JSON, discriminated by "type"):
    ping                                    keep-alive
    signal        {to, data}                SDP offer/answer or ICE candidate for one peer
    media         {audio?, video?, screen?} my mic / camera / screen-share state changed
    hand          {raised}                  raise / lower hand
    chat          {text}                    message to everyone
    reaction      {emoji}                   emoji reaction
    host:mute-all | host:mute {target} | host:ask-unmute {target}
    host:stop-video {target} | host:remove {target} | host:end

Server -> client messages:
    welcome {self, peers, messages}, peer-joined {peer}, peer-updated {peer}, peer-left {id},
    signal {from, data}, chat {message}, reaction {from, emoji}, force-mute, ask-unmute,
    force-stop-video, removed, meeting-ended, error {code, message}, pong
"""

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
from starlette.concurrency import run_in_threadpool

from ..config import get_settings
from ..database import SessionLocal, utcnow
from ..models import ChatMessage, MeetingParticipant, MeetingStatus
from ..security import verify_ws_token
from ..services import meetings as meeting_service
from ..services.rooms import Peer, rooms

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_REACTIONS = {"👏", "👍", "❤️", "😂", "😮", "🎉"}
MAX_CHAT_LENGTH = 1000
CHAT_HISTORY_LIMIT = 200

# Close codes in the private 4000-4999 range so the client can tell them apart.
CLOSE_UNAUTHORIZED = 4401
CLOSE_REPLACED = 4000
CLOSE_REMOVED = 4003
CLOSE_ENDED = 4004


# --------------------------------------------------------------------------- database helpers
# These are synchronous (SQLAlchemy + SQLite) and are run in the threadpool from async code.


def _open_session(participant_id: int, code: str) -> dict[str, Any] | None:
    """Validates the participant and marks them present. Returns what the socket needs, or None."""
    with SessionLocal() as db:
        participant = db.get(MeetingParticipant, participant_id)
        if participant is None or participant.was_removed:
            return None
        meeting = participant.meeting
        if meeting.meeting_code != code or meeting.status == MeetingStatus.ENDED:
            return None
        participant.left_at = None
        db.commit()
        history = meeting.messages[-CHAT_HISTORY_LIMIT:]
        return {
            "meeting_id": meeting.id,
            "display_name": participant.display_name,
            "role": participant.role.value,
            "messages": [meeting_service.to_chat_out(m).model_dump(mode="json") for m in history],
        }


def _mark_left(participant_id: int, removed: bool = False) -> None:
    with SessionLocal() as db:
        participant = db.get(MeetingParticipant, participant_id)
        if participant is None:
            return
        participant.left_at = participant.left_at or utcnow()
        participant.was_removed = participant.was_removed or removed
        db.commit()


def _save_chat(meeting_id: int, participant_id: int, text: str) -> dict[str, Any]:
    with SessionLocal() as db:
        message = ChatMessage(meeting_id=meeting_id, participant_id=participant_id, content=text)
        db.add(message)
        db.commit()
        db.refresh(message)
        return meeting_service.to_chat_out(message).model_dump(mode="json")


def _end_meeting(meeting_id: int) -> None:
    with SessionLocal() as db:
        meeting_service.end_meeting(db, meeting_id)


# --------------------------------------------------------------------------- lifecycle


async def _close(websocket: WebSocket, code: int) -> None:
    try:
        await websocket.close(code=code)
    except Exception:
        pass  # already closed


async def _end_when_empty(code: str, meeting_id: int) -> None:
    """Ends the meeting if nobody (re)joins within the grace period (covers page refreshes)."""
    await asyncio.sleep(get_settings().empty_room_grace_seconds)
    room = rooms.get(code)
    if room is None or room.peers:
        return
    room.end_task = None  # we are that task; don't let close_room cancel us
    rooms.close_room(code)
    await run_in_threadpool(_end_meeting, meeting_id)


async def _disconnect(code: str, peer: Peer) -> None:
    removed = rooms.remove_peer(code, peer.participant_id, peer.websocket)
    if removed is None:
        return  # replaced by a newer connection, or already removed by the host / meeting end
    await run_in_threadpool(_mark_left, peer.participant_id)
    await rooms.broadcast(code, {"type": "peer-left", "id": peer.participant_id})
    room = rooms.get(code)
    if room is not None and not room.peers:
        room.end_task = asyncio.create_task(_end_when_empty(code, room.meeting_id))


@router.websocket("/ws/meetings/{code}")
async def meeting_socket(websocket: WebSocket, code: str, token: str = "", audio: bool = True, video: bool = True):
    await websocket.accept()

    participant_id = verify_ws_token(token, code)
    session = await run_in_threadpool(_open_session, participant_id, code) if participant_id else None
    if session is None:
        await websocket.send_json({"type": "error", "code": "UNAUTHORIZED", "message": "Unable to join this meeting."})
        await _close(websocket, CLOSE_UNAUTHORIZED)
        return

    peer = Peer(
        participant_id=participant_id,
        display_name=session["display_name"],
        role=session["role"],
        websocket=websocket,
        audio=audio,
        video=video,
    )
    previous = rooms.add_peer(code, session["meeting_id"], peer)
    if previous is not None:
        await _close(previous.websocket, CLOSE_REPLACED)

    room = rooms.get(code)
    others = [p.public() for pid, p in room.peers.items() if pid != participant_id]
    await rooms.send(peer, {"type": "welcome", "self": peer.public(), "peers": others, "messages": session["messages"]})
    await rooms.broadcast(code, {"type": "peer-joined", "peer": peer.public()}, exclude=participant_id)

    try:
        # The loop also stops when we closed the socket ourselves (host ended / removed / replaced).
        while websocket.application_state == WebSocketState.CONNECTED:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if isinstance(message, dict):
                await _handle_message(code, session["meeting_id"], peer, message)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Unexpected error on meeting socket %s", code)
    finally:
        await _disconnect(code, peer)


# --------------------------------------------------------------------------- message handling


async def _handle_message(code: str, meeting_id: int, peer: Peer, message: dict[str, Any]) -> None:
    kind = message.get("type")

    if kind == "ping":
        await rooms.send(peer, {"type": "pong"})

    elif kind == "signal":
        target = message.get("to")
        if isinstance(target, int):
            await rooms.send_to(code, target, {"type": "signal", "from": peer.participant_id, "data": message.get("data")})

    elif kind == "media":
        for attr in ("audio", "video", "screen"):
            if isinstance(message.get(attr), bool):
                setattr(peer, attr, message[attr])
        await rooms.broadcast(code, {"type": "peer-updated", "peer": peer.public()}, exclude=peer.participant_id)

    elif kind == "hand":
        peer.hand_raised = bool(message.get("raised"))
        await rooms.broadcast(code, {"type": "peer-updated", "peer": peer.public()}, exclude=peer.participant_id)

    elif kind == "chat":
        text = str(message.get("text", "")).strip()[:MAX_CHAT_LENGTH]
        if text:
            saved = await run_in_threadpool(_save_chat, meeting_id, peer.participant_id, text)
            await rooms.broadcast(code, {"type": "chat", "message": saved})

    elif kind == "reaction":
        emoji = message.get("emoji")
        if emoji in ALLOWED_REACTIONS:
            await rooms.broadcast(code, {"type": "reaction", "from": peer.participant_id, "emoji": emoji})

    elif isinstance(kind, str) and kind.startswith("host:"):
        if not peer.is_host:
            await rooms.send(peer, {"type": "error", "code": "NOT_HOST", "message": "Only the host can do that."})
            return
        await _handle_host_action(code, meeting_id, kind, message)


async def _handle_host_action(code: str, meeting_id: int, kind: str, message: dict[str, Any]) -> None:
    target = message.get("target")

    if kind == "host:mute-all":
        room = rooms.get(code)
        for other in list(room.peers.values()) if room else []:
            if not other.is_host:
                await rooms.send(other, {"type": "force-mute"})

    elif kind == "host:mute" and isinstance(target, int):
        await rooms.send_to(code, target, {"type": "force-mute"})

    elif kind == "host:ask-unmute" and isinstance(target, int):
        await rooms.send_to(code, target, {"type": "ask-unmute"})

    elif kind == "host:stop-video" and isinstance(target, int):
        await rooms.send_to(code, target, {"type": "force-stop-video"})

    elif kind == "host:remove" and isinstance(target, int):
        removed = rooms.remove_peer(code, target)
        if removed is None:
            return
        await run_in_threadpool(_mark_left, target, True)
        await rooms.send(removed, {"type": "removed"})
        await _close(removed.websocket, CLOSE_REMOVED)
        await rooms.broadcast(code, {"type": "peer-left", "id": target})

    elif kind == "host:end":
        room = rooms.close_room(code)
        await run_in_threadpool(_end_meeting, meeting_id)
        if room is not None:
            peers = list(room.peers.values())
            await asyncio.gather(*(rooms.send(p, {"type": "meeting-ended"}) for p in peers))
            await asyncio.gather(*(_close(p.websocket, CLOSE_ENDED) for p in peers))
