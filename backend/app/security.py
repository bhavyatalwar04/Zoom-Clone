"""Generators for meeting identifiers and signed tokens."""

import hashlib
import hmac
import secrets
import string

from .config import get_settings

_PASSCODE_ALPHABET = string.ascii_letters + string.digits


def generate_meeting_code() -> str:
    """An 11 digit numeric Meeting ID, like Zoom's (never starts with 0)."""
    return str(secrets.randbelow(9 * 10**10) + 10**10)


def generate_passcode(length: int = 6) -> str:
    return "".join(secrets.choice(_PASSCODE_ALPHABET) for _ in range(length))


def generate_start_token() -> str:
    return secrets.token_urlsafe(24)


def _sign(payload: str) -> str:
    key = get_settings().secret_key.encode()
    return hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()[:32]


def create_ws_token(participant_id: int, meeting_code: str) -> str:
    """Token returned by the join endpoint that authorises one participant's WebSocket."""
    payload = f"{participant_id}.{meeting_code}"
    return f"{participant_id}.{_sign(payload)}"


def verify_ws_token(token: str, meeting_code: str) -> int | None:
    """Returns the participant id if the token is valid for this meeting, else None."""
    participant_id, _, signature = token.partition(".")
    if not participant_id.isdigit() or not signature:
        return None
    expected = _sign(f"{participant_id}.{meeting_code}")
    return int(participant_id) if hmac.compare_digest(expected, signature) else None
