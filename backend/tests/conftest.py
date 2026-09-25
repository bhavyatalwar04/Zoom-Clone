import os
import tempfile
from contextlib import ExitStack, contextmanager
from pathlib import Path

import pytest

_db_file = Path(tempfile.mkdtemp()) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_db_file.as_posix()}"
os.environ["FRONTEND_URL"] = "http://testserver-frontend"

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    with TestClient(app) as test_client:  # lifespan creates the tables and seeds
        yield test_client


class Meeting:
    """Helper that starts an instant meeting and lets tests join people over REST + WebSocket."""

    def __init__(self, client):
        self.client = client
        data = client.post("/api/meetings/instant", json={}).json()
        self.code, self.passcode, self.start_token = data["code"], data["passcode"], data["start_token"]

    def join(self, name: str, host: bool = False) -> dict:
        body = {"display_name": name, **({"start_token": self.start_token} if host else {"passcode": self.passcode})}
        res = self.client.post(f"/api/meetings/{self.code}/join", json=body)
        assert res.status_code == 200, res.text
        return res.json()

    def connect(self, joined: dict):
        return self.client.websocket_connect(f"/ws/meetings/{self.code}?token={joined['ws_token']}")


def receive_until(ws, kind: str) -> dict:
    """Skip unrelated messages until one of the given type arrives."""
    for _ in range(50):
        message = ws.receive_json()
        if message["type"] == kind:
            return message
    raise AssertionError(f"no {kind!r} message received")


@contextmanager
def connected(meeting, *joined):
    """Connects people one at a time, each waiting for their welcome, so the join order (and
    therefore who receives which `peer-joined`) is deterministic. Yields (sockets, welcomes)."""
    with ExitStack() as stack:
        sockets, welcomes = [], []
        for person in joined:
            ws = stack.enter_context(meeting.connect(person))
            welcomes.append(receive_until(ws, "welcome"))
            sockets.append(ws)
        yield sockets, welcomes


@pytest.fixture()
def meeting(client):
    return Meeting(client)
