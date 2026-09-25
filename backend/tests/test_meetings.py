from datetime import datetime, timedelta


def _schedule_payload(**overrides):
    start = (datetime.now() + timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
    payload = {
        "title": "Weekly Sync",
        "description": "Agenda",
        "start_time": start.isoformat(),
        "timezone": "Asia/Kolkata",
        "duration_minutes": 45,
        "invitees": ["priya.sharma@example.com", "new.person@example.com"],
    }
    payload.update(overrides)
    return payload


def test_seeded_dashboard(client):
    me = client.get("/api/users/me").json()
    assert me["full_name"] == "Bhavya Talwar"

    upcoming = client.get("/api/meetings", params={"scope": "upcoming"}).json()
    recent = client.get("/api/meetings", params={"scope": "recent"}).json()
    assert len(upcoming) >= 5
    assert len(recent) == 5
    starts = [m["scheduled_start"] for m in upcoming]
    assert starts == sorted(starts)
    # start tokens are only visible to the host
    assert all((m["start_token"] is not None) == m["is_host"] for m in upcoming)


def test_instant_meeting_and_join_flow(client):
    meeting = client.post("/api/meetings/instant", json={}).json()
    code = meeting["code"]
    assert len(code) == 11 and code.isdigit()
    assert meeting["join_url"] == f"http://testserver-frontend/j/{code}?pwd={meeting['passcode']}"
    assert meeting["status"] == "scheduled"

    # attendee cannot join before the host has started it
    res = client.post(f"/api/meetings/{code}/join", json={"display_name": "Guest", "passcode": meeting["passcode"]})
    assert res.status_code == 409 and res.json()["detail"]["code"] == "WAITING_FOR_HOST"

    host = client.post(f"/api/meetings/{code}/join", json={"display_name": "Host", "start_token": meeting["start_token"]})
    assert host.status_code == 200 and host.json()["is_host"] is True

    wrong = client.post(f"/api/meetings/{code}/join", json={"display_name": "Guest", "passcode": "nope"})
    assert wrong.status_code == 401

    guest = client.post(f"/api/meetings/{code}/join", json={"display_name": "Guest", "passcode": meeting["passcode"]})
    assert guest.status_code == 200 and guest.json()["participant"]["role"] == "attendee"


def test_lookup_accepts_formatted_ids_and_links(client):
    code = client.post("/api/meetings/instant", json={}).json()["code"]
    spaced = f"{code[:3]} {code[3:7]} {code[7:]}"
    assert client.get(f"/api/meetings/{spaced}/lookup").status_code == 200
    assert client.get("/api/meetings/12345678901/lookup").json()["detail"]["code"] == "MEETING_NOT_FOUND"


def test_schedule_update_delete(client):
    created = client.post("/api/meetings", json=_schedule_payload())
    assert created.status_code == 201, created.text
    meeting = created.json()
    # 10:00 in Asia/Kolkata is 04:30 UTC
    assert meeting["scheduled_start"].endswith("04:30:00Z")
    assert meeting["invitees"] == ["priya.sharma@example.com", "new.person@example.com"]

    upcoming_codes = [m["code"] for m in client.get("/api/meetings").json()]
    assert meeting["code"] in upcoming_codes

    updated = client.put(f"/api/meetings/{meeting['code']}", json=_schedule_payload(title="Renamed", require_passcode=False))
    assert updated.status_code == 200
    assert updated.json()["title"] == "Renamed" and updated.json()["passcode"] is None

    assert client.delete(f"/api/meetings/{meeting['code']}").status_code == 204
    assert client.get(f"/api/meetings/{meeting['code']}").status_code == 404


def test_schedule_validation(client):
    past = (datetime.now() - timedelta(days=1)).isoformat()
    assert client.post("/api/meetings", json=_schedule_payload(start_time=past)).status_code == 422
    assert client.post("/api/meetings", json=_schedule_payload(title="  ")).status_code == 422
    assert client.post("/api/meetings", json=_schedule_payload(timezone="Mars/Base")).status_code == 422
    assert client.post("/api/meetings", json=_schedule_payload(invitees=["not-an-email"])).status_code == 422
