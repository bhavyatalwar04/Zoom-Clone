from datetime import timedelta

from app.database import SessionLocal
from app.models import Meeting, MeetingStatus, MeetingType, User
from app.security import generate_meeting_code, generate_passcode, generate_start_token
from app.services import meetings as meeting_service


def _start_meeting(client):
    meeting = client.post("/api/meetings/instant", json={}).json()
    code = meeting["code"]
    host = client.post(f"/api/meetings/{code}/join", json={"display_name": "Host", "start_token": meeting["start_token"]}).json()
    guest = client.post(f"/api/meetings/{code}/join", json={"display_name": "Guest", "passcode": meeting["passcode"]}).json()
    return code, host, guest


def _sync(ws):
    """Messages on one socket are handled in order, so a pong means everything before it is done."""
    ws.send_json({"type": "ping"})
    while ws.receive_json()["type"] != "pong":
        pass


def test_meeting_details_hidden_from_uninvolved_users(client):
    with SessionLocal() as db:
        stranger = db.query(User).filter(User.email == "david.wilson@example.com").one()
        meeting = Meeting(
            meeting_code=generate_meeting_code(), title="Private", host=stranger,
            meeting_type=MeetingType.INSTANT, passcode=generate_passcode(), start_token=generate_start_token(),
        )
        db.add(meeting)
        db.commit()
        code = meeting.meeting_code

    # The public lookup still works (the join flow needs it) but never includes the passcode.
    lookup = client.get(f"/api/meetings/{code}/lookup")
    assert lookup.status_code == 200 and "passcode" not in lookup.json()
    for path in ("", "/participants", "/messages", "/transcript", "/insights"):
        res = client.get(f"/api/meetings/{code}{path}")
        assert res.status_code == 403, path
        assert res.json()["detail"]["code"] == "FORBIDDEN"


def test_abandoned_live_meeting_is_ended(client):
    meeting = client.post("/api/meetings/instant", json={}).json()
    client.post(f"/api/meetings/{meeting['code']}/join", json={"display_name": "Host", "start_token": meeting["start_token"]})
    assert client.get(f"/api/meetings/{meeting['code']}").json()["status"] == "live"

    with SessionLocal() as db:
        # Still connected somewhere -> left alone.
        assert meeting_service.end_abandoned_meetings(db, {meeting["code"]}, timedelta(0)) == []
        # Nobody connected and past the grace period -> ended.
        assert meeting["code"] in meeting_service.end_abandoned_meetings(db, set(), timedelta(0))
        assert db.query(Meeting).filter(Meeting.meeting_code == meeting["code"]).one().status == MeetingStatus.ENDED


def test_host_is_handed_over_when_host_leaves(client):
    code, host, guest = _start_meeting(client)
    guest_id = guest["participant"]["id"]

    with client.websocket_connect(f"/ws/meetings/{code}?token={guest['ws_token']}") as guest_ws:
        guest_ws.receive_json()  # welcome
        with client.websocket_connect(f"/ws/meetings/{code}?token={host['ws_token']}") as host_ws:
            host_ws.receive_json()
            guest_ws.receive_json()  # peer-joined (host)
            # Close like a browser tab would. (Leaving the `with` block would instead cancel the
            # server handler, which is a TestClient artefact and skips the disconnect cleanup.)
            host_ws.close()
            assert guest_ws.receive_json()["type"] == "peer-left"
            assert guest_ws.receive_json() == {"type": "host-changed", "id": guest_id}

        # The new host can now use host controls.
        guest_ws.send_json({"type": "host:captions", "enabled": True})
        assert guest_ws.receive_json() == {"type": "captions-state", "enabled": True}

    roles = {p["display_name"]: p["role"] for p in client.get(f"/api/meetings/{code}/participants").json()}
    assert roles["Guest"] == "host"


def test_captions_transcript_and_insights(client):
    code, host, guest = _start_meeting(client)

    with client.websocket_connect(f"/ws/meetings/{code}?token={host['ws_token']}") as host_ws:
        assert host_ws.receive_json()["captions_enabled"] is False
        with client.websocket_connect(f"/ws/meetings/{code}?token={guest['ws_token']}") as guest_ws:
            guest_ws.receive_json()
            host_ws.receive_json()  # peer-joined

            # Captions are ignored until the host turns them on.
            guest_ws.send_json({"type": "caption", "text": "too early", "final": True})
            guest_ws.send_json({"type": "host:captions", "enabled": True})
            assert guest_ws.receive_json()["code"] == "NOT_HOST"

            host_ws.send_json({"type": "host:captions", "enabled": True})
            assert host_ws.receive_json() == {"type": "captions-state", "enabled": True}
            assert guest_ws.receive_json() == {"type": "captions-state", "enabled": True}

            guest_ws.send_json({"type": "caption", "text": "hello every", "final": False})
            interim = host_ws.receive_json()
            assert interim["final"] is False and "segment" not in interim
            guest_ws.send_json({"type": "caption", "text": "hello everyone", "final": True})
            final = host_ws.receive_json()
            assert final["final"] is True and final["segment"]["speaker_name"] == "Guest"

            guest_ws.send_json({"type": "talk-time", "ms": 5000})
            guest_ws.send_json({"type": "talk-time", "ms": 999_999})  # implausible, ignored
            guest_ws.send_json({"type": "reaction", "emoji": "🎉"})
            guest_ws.send_json({"type": "hand", "raised": True})
            guest_ws.send_json({"type": "chat", "text": "hi"})
            _sync(guest_ws)

        host_ws.send_json({"type": "host:end"})

    transcript = client.get(f"/api/meetings/{code}/transcript").json()
    assert [t["content"] for t in transcript] == ["hello everyone"]

    insights = client.get(f"/api/meetings/{code}/insights").json()
    guest_stats = next(p for p in insights["participants"] if p["display_name"] == "Guest")
    assert guest_stats["talk_seconds"] == 5 and guest_stats["talk_share"] == 1.0
    assert guest_stats["reactions"] == 1 and guest_stats["hand_raises"] == 1 and guest_stats["messages"] == 1
    assert insights["reactions_by_emoji"] == [{"emoji": "🎉", "count": 1}]
    assert insights["participant_count"] == 2 and insights["transcript_lines"] == 1


def test_seeded_meetings_have_insights(client):
    recent = client.get("/api/meetings", params={"scope": "recent"}).json()
    bug_bash = next(m for m in recent if m["title"] == "Bug Bash")
    insights = client.get(f"/api/meetings/{bug_bash['code']}/insights").json()
    assert insights["total_talk_seconds"] > 0 and insights["transcript_lines"] == 5
    assert insights["participants"][0]["is_host"]  # the host talks the most in the sample data
