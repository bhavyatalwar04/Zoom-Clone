"""Live meetings over WebSockets: signalling relay, presence and in-meeting features.

    state.py      who is in which room (in memory)
    store.py      database helpers (run in a thread pool)
    lifecycle.py  admit / waiting room / leave / end
    handlers/     one module per feature; each message type registered with @on(...)
    socket.py     the WebSocket endpoint
"""

from .lifecycle import run_abandoned_meeting_sweeper
from .socket import router

__all__ = ["router", "run_abandoned_meeting_sweeper"]
