"""WebSocket endpoint: authenticates a participant, admits them (or parks them in the waiting
room) and feeds their messages to the handler registry.

Protocol overview (see handlers/* for every message):
    client -> server   signal, media, hand, feedback, reaction, rename, chat, caption, talk-time,
                       host:* moderation commands (mute, remove, roles, spotlight, security, ...)
    server -> client   welcome, waiting, waiting-list, peer-joined / peer-updated / peer-left,
                       host-changed, spotlight, security, signal, chat, reaction, caption,
                       captions-state, force-mute, ask-unmute, force-stop-video, force-stop-share,
                       removed, meeting-ended, error, pong
"""

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from ..security import verify_ws_token
from . import lifecycle, store
from .handlers import Ctx, dispatch
from .state import Peer, Security, rooms
from .store import db

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/meetings/{code}")
async def meeting_socket(websocket: WebSocket, code: str, token: str = "", audio: bool = True, video: bool = True):
    await websocket.accept()

    participant_id = verify_ws_token(token, code)
    session = await db(store.open_session, participant_id, code) if participant_id else None
    if session is None:
        await websocket.send_json({"type": "error", "code": "UNAUTHORIZED", "message": "Unable to join this meeting."})
        await lifecycle.close_socket(websocket, lifecycle.CLOSE_UNAUTHORIZED)
        return

    room = rooms.get_or_create(
        code, session["meeting_id"], Security(locked=session["locked"], waiting_room=session["waiting_room"])
    )
    peer = Peer(
        participant_id=participant_id,
        display_name=session["display_name"],
        role=session["role"],
        websocket=websocket,
        audio=audio,
        video=video,
    )
    if lifecycle.must_wait(room, peer):
        await lifecycle.put_in_waiting_room(room, peer, session["title"])
    else:
        await lifecycle.admit(room, peer)

    ctx = Ctx(room=room, peer=peer)
    try:
        # The loop also stops when we closed the socket ourselves (meeting ended / removed / replaced).
        while websocket.application_state == WebSocketState.CONNECTED:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if not isinstance(message, dict):
                continue
            # People in the waiting room can't do anything until they are admitted.
            if room.waiting.get(participant_id) is peer and message.get("type") != "ping":
                continue
            await dispatch(ctx, message)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Unexpected error on meeting socket %s", code)
    finally:
        await lifecycle.disconnect(room, peer)
