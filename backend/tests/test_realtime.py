def _start_meeting(client):
    meeting = client.post("/api/meetings/instant", json={}).json()
    code = meeting["code"]
    host = client.post(f"/api/meetings/{code}/join", json={"display_name": "Host", "start_token": meeting["start_token"]}).json()
    guest = client.post(f"/api/meetings/{code}/join", json={"display_name": "Guest", "passcode": meeting["passcode"]}).json()
    return code, host, guest


def test_signalling_chat_and_host_controls(client):
    code, host, guest = _start_meeting(client)

    with client.websocket_connect(f"/ws/meetings/{code}?token={host['ws_token']}") as host_ws:
        welcome = host_ws.receive_json()
        assert welcome["type"] == "welcome" and welcome["peers"] == []

        with client.websocket_connect(f"/ws/meetings/{code}?token={guest['ws_token']}&video=false") as guest_ws:
            guest_welcome = guest_ws.receive_json()
            assert [p["display_name"] for p in guest_welcome["peers"]] == ["Host"]
            joined = host_ws.receive_json()
            assert joined["type"] == "peer-joined" and joined["peer"]["video"] is False

            # signalling is relayed to the addressed peer only
            guest_ws.send_json({"type": "signal", "to": host["participant"]["id"], "data": {"sdp": "offer"}})
            relayed = host_ws.receive_json()
            assert relayed == {"type": "signal", "from": guest["participant"]["id"], "data": {"sdp": "offer"}}

            # chat is persisted and broadcast to everyone
            guest_ws.send_json({"type": "chat", "text": "hello"})
            assert host_ws.receive_json()["message"]["content"] == "hello"
            assert guest_ws.receive_json()["message"]["sender_name"] == "Guest"

            # attendees cannot use host controls
            guest_ws.send_json({"type": "host:mute-all"})
            assert guest_ws.receive_json()["code"] == "NOT_HOST"

            host_ws.send_json({"type": "host:mute-all"})
            assert guest_ws.receive_json() == {"type": "force-mute"}

            host_ws.send_json({"type": "host:remove", "target": guest["participant"]["id"]})
            assert guest_ws.receive_json() == {"type": "removed"}
            assert host_ws.receive_json() == {"type": "peer-left", "id": guest["participant"]["id"]}

        host_ws.send_json({"type": "host:end"})
        assert host_ws.receive_json() == {"type": "meeting-ended"}

    meeting = client.get(f"/api/meetings/{code}").json()
    assert meeting["status"] == "ended"
    assert code in [m["code"] for m in client.get("/api/meetings", params={"scope": "recent"}).json()]
    participants = client.get(f"/api/meetings/{code}/participants").json()
    assert all(p["left_at"] for p in participants)
    assert any(p["was_removed"] for p in participants)
    assert [m["content"] for m in client.get(f"/api/meetings/{code}/messages").json()] == ["hello"]


def test_rejects_invalid_token(client):
    code, _host, _guest = _start_meeting(client)
    with client.websocket_connect(f"/ws/meetings/{code}?token=1.bad") as ws:
        assert ws.receive_json()["code"] == "UNAUTHORIZED"
