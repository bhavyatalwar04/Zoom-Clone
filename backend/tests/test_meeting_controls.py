"""Tier 1 Zoom controls: waiting room, lock, roles, spotlight, security, private chat, feedback."""

from conftest import receive_until


def receive_matching(ws, kind, predicate):
    for _ in range(50):
        message = receive_until(ws, kind)
        if predicate(message):
            return message
    raise AssertionError(f"no matching {kind!r}")


def ping(ws):
    ws.send_json({"type": "ping"})
    return receive_until(ws, "pong")


def test_waiting_room_admit_remove_and_lock(client, meeting):
    host = meeting.join("Host", host=True)
    guest = meeting.join("Guest")
    with meeting.connect(host) as host_ws:
        receive_until(host_ws, "welcome")
        host_ws.send_json({"type": "host:security", "waiting_room": True})
        assert receive_until(host_ws, "security")["security"]["waiting_room"] is True

        with meeting.connect(guest) as guest_ws:
            assert guest_ws.receive_json() == {"type": "waiting", "title": "Bhavya Talwar's Zoom Meeting"}
            waiting = receive_until(host_ws, "waiting-list")["waiting"]
            assert [w["display_name"] for w in waiting] == ["Guest"]

            # Waiting people can't do anything yet.
            guest_ws.send_json({"type": "chat", "text": "let me in"})
            ping(guest_ws)

            host_ws.send_json({"type": "host:admit", "target": guest["participant"]["id"]})
            welcome = receive_until(guest_ws, "welcome")
            assert [p["display_name"] for p in welcome["peers"]] == ["Host"]
            assert welcome["messages"] == []  # the chat sent while waiting was ignored
            assert receive_until(host_ws, "peer-joined")["peer"]["display_name"] == "Guest"
            assert receive_until(host_ws, "waiting-list")["waiting"] == []

            # A second person is turned away from the waiting room.
            late = meeting.join("Late")
            with meeting.connect(late) as late_ws:
                assert late_ws.receive_json()["type"] == "waiting"
                receive_until(host_ws, "waiting-list")
                host_ws.send_json({"type": "host:remove", "target": late["participant"]["id"]})
                assert late_ws.receive_json() == {"type": "removed"}

            # Locking the meeting stops new people joining at all.
            host_ws.send_json({"type": "host:security", "locked": True})
            receive_until(host_ws, "security")
            res = client.post(f"/api/meetings/{meeting.code}/join", json={"display_name": "X", "passcode": meeting.passcode})
            assert res.status_code == 423 and res.json()["detail"]["code"] == "MEETING_LOCKED"


def test_roles_cohost_make_host_and_spotlight(meeting):
    host, guest = meeting.join("Host", host=True), meeting.join("Guest")
    guest_id = guest["participant"]["id"]
    with meeting.connect(host) as host_ws, meeting.connect(guest) as guest_ws:
        receive_until(host_ws, "peer-joined")
        receive_until(guest_ws, "welcome")

        guest_ws.send_json({"type": "host:spotlight", "target": host["participant"]["id"]})
        assert receive_until(guest_ws, "error")["code"] == "NOT_HOST"

        host_ws.send_json({"type": "host:make-cohost", "target": guest_id})
        assert receive_until(guest_ws, "peer-updated")["peer"]["role"] == "co_host"

        # Co-hosts can moderate (spotlight) but not end the meeting.
        guest_ws.send_json({"type": "host:spotlight", "target": host["participant"]["id"]})
        assert receive_until(host_ws, "spotlight")["id"] == host["participant"]["id"]
        guest_ws.send_json({"type": "host:end"})
        assert receive_until(guest_ws, "error")["message"] == "Only the host can do that."

        host_ws.send_json({"type": "host:make-host", "target": guest_id})
        updates = [receive_until(guest_ws, "peer-updated")["peer"] for _ in range(2)]
        assert {p["display_name"]: p["role"] for p in updates} == {"Guest": "host", "Host": "attendee"}
        host_ws.send_json({"type": "host:end"})
        assert receive_until(host_ws, "error")["code"] == "NOT_HOST"


def test_private_chat_and_security_permissions(client, meeting):
    host, a, b = meeting.join("Host", host=True), meeting.join("Alice"), meeting.join("Bob")
    host_id, a_id, b_id = (x["participant"]["id"] for x in (host, a, b))
    with meeting.connect(host) as host_ws, meeting.connect(a) as a_ws, meeting.connect(b) as b_ws:
        receive_until(host_ws, "peer-joined")
        receive_until(host_ws, "peer-joined")
        receive_until(a_ws, "peer-joined")
        receive_until(b_ws, "welcome")

        # Private message: only sender and recipient get it.
        a_ws.send_json({"type": "chat", "text": "psst", "to": b_id})
        dm = receive_until(b_ws, "chat")["message"]
        assert dm["recipient_id"] == b_id and dm["recipient_name"] == "Bob"
        assert receive_until(a_ws, "chat")["message"]["content"] == "psst"
        host_ws.send_json({"type": "ping"})
        assert host_ws.receive_json()["type"] == "pong"  # nothing arrived before the pong

        # Chat disabled: public messages are refused, messages to the host still work.
        host_ws.send_json({"type": "host:security", "allow_chat": False, "allow_unmute": False})
        receive_until(a_ws, "security")
        a_ws.send_json({"type": "chat", "text": "hello all"})
        assert receive_until(a_ws, "error")["code"] == "CHAT_DISABLED"
        a_ws.send_json({"type": "chat", "text": "question for host", "to": host_id})
        assert receive_until(host_ws, "chat")["message"]["content"] == "question for host"

        # Unmuting disabled: an unmute is refused until the host asks.
        a_ws.send_json({"type": "media", "audio": False})
        a_ws.send_json({"type": "media", "audio": True})
        assert receive_until(a_ws, "force-mute") == {"type": "force-mute"}
        host_ws.send_json({"type": "host:ask-unmute", "target": a_id})
        receive_until(a_ws, "ask-unmute")
        a_ws.send_json({"type": "media", "audio": True})
        assert receive_matching(host_ws, "peer-updated", lambda m: m["peer"]["audio"])["peer"]["id"] == a_id

    history = client.get(f"/api/meetings/{meeting.code}/messages").json()
    assert history == []  # private messages are never part of the saved history


def test_feedback_rename_and_lower_hands(meeting):
    host, guest = meeting.join("Host", host=True), meeting.join("Guest")
    guest_id = guest["participant"]["id"]
    with meeting.connect(host) as host_ws, meeting.connect(guest) as guest_ws:
        receive_until(host_ws, "peer-joined")
        receive_until(guest_ws, "welcome")

        guest_ws.send_json({"type": "feedback", "value": "slower"})
        assert receive_until(host_ws, "peer-updated")["peer"]["feedback"] == "slower"

        guest_ws.send_json({"type": "rename", "name": "  Guest   Speaker "})
        assert receive_until(host_ws, "peer-updated")["peer"]["display_name"] == "Guest Speaker"

        host_ws.send_json({"type": "host:security", "allow_rename": False})
        receive_until(guest_ws, "security")
        guest_ws.send_json({"type": "rename", "name": "Sneaky"})
        assert receive_until(guest_ws, "error")["code"] == "RENAME_DISABLED"
        host_ws.send_json({"type": "host:rename", "target": guest_id, "name": "Renamed by host"})
        assert receive_until(guest_ws, "peer-updated")["peer"]["display_name"] == "Renamed by host"

        guest_ws.send_json({"type": "hand", "raised": True})
        receive_matching(host_ws, "peer-updated", lambda m: m["peer"]["hand_raised"])
        host_ws.send_json({"type": "host:lower-hands"})
        lowered = receive_until(guest_ws, "peer-updated")["peer"]
        assert lowered["id"] == guest_id and lowered["hand_raised"] is False
