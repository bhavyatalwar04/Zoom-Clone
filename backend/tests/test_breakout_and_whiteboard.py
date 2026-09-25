import time

from conftest import connected, receive_until

from app.realtime.handlers import breakout as breakout_module


def receive_matching(ws, kind, predicate, attempts=60):
    for _ in range(attempts):
        message = receive_until(ws, kind)
        if predicate(message):
            return message
    raise AssertionError(f"no matching {kind!r}")


def test_breakout_rooms_move_people_and_scope_chat(client, meeting, monkeypatch):
    monkeypatch.setattr(breakout_module, "CLOSE_COUNTDOWN_SECONDS", 0)
    host, a, b = meeting.join("Host", host=True), meeting.join("Alice"), meeting.join("Bob")
    a_id, b_id = a["participant"]["id"], b["participant"]["id"]
    with connected(meeting, host, a, b) as ((host_ws, a_ws, b_ws), _):
        a_ws.send_json({"type": "host:breakout-create", "count": 2, "auto": True})
        assert receive_until(a_ws, "error")["code"] == "NOT_HOST"

        host_ws.send_json({"type": "host:breakout-create", "count": 2, "auto": True})
        plan = receive_until(host_ws, "breakout-state")["breakout"]
        assert plan["open"] is False and [len(r["members"]) for r in plan["rooms"]] == [1, 1]

        # Put both attendees in Room 1, then open.
        host_ws.send_json({"type": "host:breakout-assign", "target": b_id, "position": 0})
        receive_matching(host_ws, "breakout-state", lambda m: len(m["breakout"]["rooms"][0]["members"]) == 2)
        host_ws.send_json({"type": "host:breakout-open"})

        moved_a = receive_until(a_ws, "moved")
        assert moved_a["room_name"] == "Room 1" and moved_a["peers"] == []  # first one in
        moved_b = receive_until(b_ws, "moved")
        assert [p["display_name"] for p in moved_b["peers"]] == ["Alice"]  # Bob offers to Alice
        joined = receive_until(a_ws, "peer-joined")
        assert joined["peer"]["display_name"] == "Bob"
        state = receive_matching(host_ws, "breakout-state", lambda m: m["breakout"]["open"])["breakout"]
        assert state["rooms"][0]["group"] and len(state["rooms"][0]["members"]) == 2

        # Chat inside the room stays inside the room.
        a_ws.send_json({"type": "chat", "text": "room one only"})
        assert receive_until(b_ws, "chat")["message"]["content"] == "room one only"
        host_ws.send_json({"type": "ping"})
        assert receive_matching(host_ws, "pong", lambda m: True)  # host got no chat before pong
        a_ws.send_json({"type": "breakout-help"})
        help_request = receive_until(host_ws, "breakout-help")
        assert help_request["from"] == "Alice" and help_request["room_name"] == "Room 1"

        # The host visits Room 1, then closes all rooms: everyone comes back.
        host_ws.send_json({"type": "breakout-join", "position": 0})
        assert len(receive_until(host_ws, "moved")["peers"]) == 2
        host_ws.send_json({"type": "host:breakout-broadcast", "text": "Two minutes left"})
        assert receive_until(b_ws, "breakout-message")["text"] == "Two minutes left"
        host_ws.send_json({"type": "host:breakout-close"})
        assert receive_until(a_ws, "breakout-closing")["seconds"] == 0
        assert receive_until(a_ws, "moved")["group"] is None
        receive_matching(host_ws, "breakout-state", lambda m: not m["breakout"]["open"])

    history = client.get(f"/api/meetings/{meeting.code}/breakouts").json()
    assert [r["name"] for r in history] == ["Room 1", "Room 2"]
    assert set(history[0]["participants"]) == {"Alice", "Bob", "Host"} and history[0]["closed_at"]
    assert client.get(f"/api/meetings/{meeting.code}/messages").json() == []  # breakout chat isn't main chat


def test_whiteboard_draw_erase_and_history(client, meeting):
    host, guest = meeting.join("Host", host=True), meeting.join("Guest")
    with connected(meeting, host, guest) as ((host_ws, guest_ws), welcomes):
        assert welcomes[1]["whiteboard"] == {"open": False, "opened_by": None, "opened_by_name": None, "strokes": []}

        guest_ws.send_json({"type": "wb-open", "open": True})
        assert receive_until(host_ws, "whiteboard-state")["whiteboard"]["opened_by_name"] == "Guest"

        # A stroke streamed in two chunks.
        base = {"id": "s1", "tool": "pen", "color": "#0b5cff", "width": 3}
        guest_ws.send_json({"type": "wb-stroke", "stroke": {**base, "points": [[0.1, 0.1], [0.2, 0.2]]}})
        first = receive_until(host_ws, "wb-stroke")
        assert first["done"] is False and first["stroke"]["points"] == [[0.1, 0.1], [0.2, 0.2]]
        guest_ws.send_json({"type": "wb-stroke", "stroke": {"id": "s1", "points": [[0.3, 1.7]]}, "done": True})
        assert receive_until(host_ws, "wb-stroke")["stroke"]["points"] == [[0.3, 1.0]]  # clamped to the board

        host_ws.send_json({"type": "wb-stroke", "stroke": {**base, "id": "t1", "tool": "text", "text": "Hi", "points": [[0.5, 0.5]]}, "done": True})
        receive_until(guest_ws, "wb-stroke")
        host_ws.send_json({"type": "wb-stroke", "stroke": {**base, "id": "bad", "color": "red", "points": []}, "done": True})
        host_ws.send_json({"type": "wb-erase", "ids": ["t1"]})
        assert receive_until(guest_ws, "wb-erase")["ids"] == ["t1"]

        # Late joiners get the finished board.
        late = meeting.join("Late")
        with meeting.connect(late) as late_ws:
            board = receive_until(late_ws, "welcome")["whiteboard"]
            assert board["open"] is True and [s["id"] for s in board["strokes"]] == ["s1"]
            assert board["strokes"][0]["points"] == [[0.1, 0.1], [0.2, 0.2], [0.3, 1.0]]
            late_ws.send_json({"type": "wb-clear"})
            assert receive_until(late_ws, "error")["code"] == "NOT_ALLOWED"

    time.sleep(0.1)
    saved = client.get(f"/api/meetings/{meeting.code}/whiteboard").json()
    assert [s["id"] for s in saved] == ["s1"]
