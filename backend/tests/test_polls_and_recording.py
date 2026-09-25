from conftest import connected, receive_until


def test_poll_lifecycle(client, meeting):
    host, guest = meeting.join("Host", host=True), meeting.join("Guest")
    with connected(meeting, host, guest) as ((host_ws, guest_ws), welcomes):
        receive_until(host_ws, "peer-joined")
        assert welcomes[1]["polls"] == []

        guest_ws.send_json({"type": "host:poll-launch", "question": "Q?", "options": ["a", "b"]})
        assert receive_until(guest_ws, "error")["code"] == "NOT_HOST"
        host_ws.send_json({"type": "host:poll-launch", "question": "Lunch?", "options": ["Pizza"]})
        assert "between 2 and 10" in receive_until(host_ws, "error")["message"]

        host_ws.send_json({"type": "host:poll-launch", "question": "Lunch?", "options": ["Pizza", "Sushi", "Salad"]})
        host_view = receive_until(host_ws, "poll")["poll"]
        guest_view = receive_until(guest_ws, "poll")["poll"]
        assert host_view["total_voters"] == 0 and host_view["options"][0]["votes"] == 0
        assert guest_view["total_voters"] is None and guest_view["options"][0]["votes"] is None  # results hidden
        pizza, sushi = guest_view["options"][0]["id"], guest_view["options"][1]["id"]

        guest_ws.send_json({"type": "poll-vote", "poll_id": guest_view["id"], "option_ids": [pizza, sushi]})
        assert "only allows one answer" in receive_until(guest_ws, "error")["message"]
        guest_ws.send_json({"type": "poll-vote", "poll_id": guest_view["id"], "option_ids": [sushi]})
        assert receive_until(guest_ws, "poll")["poll"]["my_votes"] == [sushi]
        live = receive_until(host_ws, "poll")["poll"]
        assert live["total_voters"] == 1 and live["options"][1]["voters"] == ["Guest"]
        guest_ws.send_json({"type": "poll-vote", "poll_id": guest_view["id"], "option_ids": [pizza]})
        assert "already answered" in receive_until(guest_ws, "error")["message"]

        host_ws.send_json({"type": "host:poll-end", "poll_id": guest_view["id"]})
        shared = receive_until(guest_ws, "poll")["poll"]
        assert shared["status"] == "closed" and [o["votes"] for o in shared["options"]] == [0, 1, 0]

    history = client.get(f"/api/meetings/{meeting.code}/polls").json()
    assert history[0]["question"] == "Lunch?" and history[0]["total_voters"] == 1
    assert client.get(f"/api/meetings/{meeting.code}/insights").json()["polls"] == 1


def test_recording_indicator_and_history(client, meeting):
    host, guest = meeting.join("Host", host=True), meeting.join("Guest")
    with connected(meeting, host, guest) as ((host_ws, guest_ws), welcomes):
        receive_until(host_ws, "peer-joined")
        assert welcomes[1]["recording"] == {"active": False, "by": []}

        guest_ws.send_json({"type": "host:recording", "active": True})
        assert receive_until(guest_ws, "error")["code"] == "NOT_HOST"

        host_ws.send_json({"type": "host:recording", "active": True})
        state = receive_until(guest_ws, "recording-state")["recording"]
        assert state == {"active": True, "by": ["Host"]}
        host_ws.send_json({"type": "host:recording", "active": False})
        assert receive_until(guest_ws, "recording-state")["recording"]["active"] is False

        # A recording still running when the meeting ends is closed with it.
        host_ws.send_json({"type": "host:recording", "active": True})
        receive_until(guest_ws, "recording-state")
        host_ws.send_json({"type": "host:end"})
        receive_until(guest_ws, "meeting-ended")

    recordings = client.get(f"/api/meetings/{meeting.code}/insights").json()["recordings"]
    assert len(recordings) == 2 and all(r["ended_at"] for r in recordings)
    assert recordings[0]["recorded_by"] == "Host"
