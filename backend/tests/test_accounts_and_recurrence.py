from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.models import RecurrenceType
from app.services.recurrence import nth_start


def _future(days=2, hour=10):
    return (datetime.now() + timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0)


def test_signup_login_and_bearer_tokens(client):
    res = client.post("/api/auth/signup", json={"full_name": "  New   Person ", "email": "New@Example.com", "password": "hunter2hunter2"})
    assert res.status_code == 201, res.text
    token = res.json()["token"]
    auth = {"Authorization": f"Bearer {token}"}

    me = client.get("/api/users/me", headers=auth).json()
    assert me["full_name"] == "New Person" and me["email"] == "new@example.com"
    assert len(me["personal_meeting_id"]) == 10

    # A new account starts with an empty dashboard; without a token you're the demo user.
    assert client.get("/api/meetings", headers=auth).json() == []
    assert client.get("/api/users/me").json()["full_name"] == "Bhavya Talwar"

    created = client.post("/api/meetings/instant", json={}, headers=auth).json()
    assert created["host"]["email"] == "new@example.com" and created["is_host"]

    assert client.post("/api/auth/signup", json={"full_name": "X", "email": "new@example.com", "password": "12345678"}).status_code == 409
    assert client.post("/api/auth/signup", json={"full_name": "X", "email": "x@example.com", "password": "short"}).status_code == 422
    bad = client.post("/api/auth/login", json={"email": "new@example.com", "password": "wrong-password"})
    assert bad.status_code == 401 and bad.json()["detail"]["code"] == "INVALID_CREDENTIALS"
    assert client.post("/api/auth/login", json={"email": "NEW@example.com", "password": "hunter2hunter2"}).status_code == 200

    expired = client.get("/api/users/me", headers={"Authorization": "Bearer 1.1.deadbeef"})
    assert expired.status_code == 401 and expired.json()["detail"]["code"] == "SESSION_EXPIRED"

    # Seeded accounts can sign in with the demo password.
    demo = client.post("/api/auth/login", json={"email": "priya.sharma@example.com", "password": "zoom1234"})
    assert demo.status_code == 200 and demo.json()["user"]["full_name"] == "Priya Sharma"


def test_personal_meeting_room(client):
    room = client.get("/api/meetings/personal").json()
    assert room["meeting_type"] == "personal" and len(room["code"]) == 10 and room["waiting_room"]
    assert client.get("/api/users/me").json()["personal_meeting_id"] == room["code"]
    assert client.get("/api/meetings/personal").json()["code"] == room["code"]  # stable

    via_new_meeting = client.post("/api/meetings/instant", json={"use_pmi": True}).json()
    assert via_new_meeting["code"] == room["code"]
    assert client.delete(f"/api/meetings/{room['code']}").json()["detail"]["code"] == "PERSONAL_ROOM"
    # The personal room is not an "upcoming" meeting.
    assert room["code"] not in [m["code"] for m in client.get("/api/meetings").json()]


def test_recurring_meeting_occurrences(client):
    start = _future()
    body = {
        "title": "Weekly Sync",
        "start_time": start.isoformat(),
        "timezone": "Asia/Kolkata",
        "duration_minutes": 30,
        "recurrence": "weekly",
        "recurrence_count": 3,
    }
    created = client.post("/api/meetings", json=body)
    assert created.status_code == 201, created.text
    meeting = created.json()
    assert meeting["recurrence"] == {"type": "weekly", "interval": 1, "count": 3, "until": None}
    assert len(meeting["next_occurrences"]) == 3

    listed = [m for m in client.get("/api/meetings").json() if m["code"] == meeting["code"]]
    starts = [datetime.fromisoformat(m["scheduled_start"].replace("Z", "+00:00")) for m in listed]
    assert len(starts) == 3 and all(b - a == timedelta(weeks=1) for a, b in zip(starts, starts[1:]))

    # Ending both by count and by date (or neither) is rejected.
    both = {**body, "recurrence_end_date": (start + timedelta(days=30)).date().isoformat()}
    assert client.post("/api/meetings", json=both).status_code == 422
    assert client.post("/api/meetings", json={**body, "recurrence_count": None}).status_code == 422

    by_date = {**body, "recurrence": "daily", "recurrence_count": None, "recurrence_end_date": (start + timedelta(days=4)).date().isoformat()}
    daily = client.post("/api/meetings", json=by_date).json()
    assert len([m for m in client.get("/api/meetings").json() if m["code"] == daily["code"]]) == 5


def test_recurrence_keeps_local_time_and_month_ends():
    # Monthly on the 31st falls on the last day of shorter months.
    first = datetime(2027, 1, 31, 4, 30, tzinfo=timezone.utc)  # 10:00 in Kolkata
    months = [nth_start(first, "Asia/Kolkata", RecurrenceType.MONTHLY, 1, n) for n in range(3)]
    assert [m.astimezone(ZoneInfo("Asia/Kolkata")).day for m in months] == [31, 28, 31]

    # Weekly at 10:00 New York time stays at 10:00 across the March daylight-saving change.
    ny = ZoneInfo("America/New_York")
    first = datetime(2027, 3, 1, 10, 0, tzinfo=ny).astimezone(timezone.utc)
    weeks = [nth_start(first, "America/New_York", RecurrenceType.WEEKLY, 1, n).astimezone(ny) for n in range(3)]
    assert [w.hour for w in weeks] == [10, 10, 10]
    assert weeks[1].utcoffset() != weeks[2].utcoffset()  # the offset changed, the wall time didn't
