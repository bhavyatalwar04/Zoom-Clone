"""Recurring meetings: every occurrence shares the Meeting ID and settings; start times are computed.

Occurrences are generated in the meeting's own time zone, so "every Monday at 10:00" stays at
10:00 local time across daylight-saving changes, and a monthly meeting on the 31st falls on the
last day of shorter months.
"""

import calendar
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from ..models import Meeting, RecurrenceType

# Upper bound for series that end by date rather than by count.
MAX_SERIES_LENGTH = 400


def _add_months(value: datetime, months: int) -> datetime:
    month_index = value.month - 1 + months
    year, month = value.year + month_index // 12, month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def nth_start(first_start: datetime, tz_name: str, recurrence: RecurrenceType, interval: int, n: int) -> datetime:
    """Start (UTC) of occurrence number `n` (0-based) of a series."""
    tz = ZoneInfo(tz_name)
    local = first_start.astimezone(tz).replace(tzinfo=None)  # wall-clock time in the meeting's zone
    if recurrence == RecurrenceType.DAILY:
        local += timedelta(days=interval * n)
    elif recurrence == RecurrenceType.WEEKLY:
        local += timedelta(weeks=interval * n)
    else:
        local = _add_months(local, interval * n)
    return local.replace(tzinfo=tz).astimezone(timezone.utc)


def end_of_day(day: date, tz_name: str) -> datetime:
    """The last moment of `day` in the given zone, as UTC (used for "repeat until <date>")."""
    return datetime.combine(day, time.max).replace(tzinfo=ZoneInfo(tz_name)).astimezone(timezone.utc)


def occurrences(meeting: Meeting, *, after: datetime | None = None, limit: int = 10) -> list[datetime]:
    """Start times (UTC) of occurrences that have not finished by `after`, earliest first."""
    start = meeting.scheduled_start
    if start is None:
        return []
    duration = timedelta(minutes=meeting.duration_minutes)
    if meeting.recurrence is None:
        return [start] if after is None or start + duration > after else []

    result: list[datetime] = []
    total = meeting.recurrence_count or MAX_SERIES_LENGTH
    for n in range(total):
        occurrence = nth_start(start, meeting.timezone, meeting.recurrence, meeting.recurrence_interval, n)
        if meeting.recurrence_until is not None and occurrence > meeting.recurrence_until:
            break
        if after is None or occurrence + duration > after:
            result.append(occurrence)
            if len(result) >= limit:
                break
    return result
