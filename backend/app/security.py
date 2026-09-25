"""Generators for meeting identifiers and signed tokens."""

import base64
import hashlib
import hmac
import secrets
import string
import time

from .config import get_settings

_PASSCODE_ALPHABET = string.ascii_letters + string.digits


def generate_meeting_code() -> str:
    """An 11 digit numeric Meeting ID, like Zoom's (never starts with 0)."""
    return str(secrets.randbelow(9 * 10**10) + 10**10)


def generate_personal_meeting_id() -> str:
    """A 10 digit Personal Meeting ID (never starts with 0; 11 digit ids are used for other meetings)."""
    return str(secrets.randbelow(9 * 10**9) + 10**9)


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


# --------------------------------------------------------------------------- passwords & sessions

PASSWORD_ITERATIONS = 120_000
SESSION_TTL_SECONDS = 7 * 24 * 3600


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def hash_password(password: str) -> str:
    """Salted PBKDF2-SHA256 (standard library), stored as algorithm$iterations$salt$hash."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str | None) -> bool:
    try:
        algorithm, iterations, salt, digest = (stored or "").split("$")
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt), int(iterations))
    return hmac.compare_digest(candidate, base64.b64decode(digest))


def create_session_token(user_id: int, now: float | None = None) -> str:
    """Stateless bearer token: user id + expiry, signed with the server secret."""
    expires = int((time.time() if now is None else now) + SESSION_TTL_SECONDS)
    return f"{user_id}.{expires}.{_sign(f'session.{user_id}.{expires}')}"


def verify_session_token(token: str, now: float | None = None) -> int | None:
    """Returns the user id for a valid, unexpired token, else None."""
    parts = token.split(".")
    if len(parts) != 3 or not parts[0].isdigit() or not parts[1].isdigit():
        return None
    user_id, expires, signature = int(parts[0]), int(parts[1]), parts[2]
    if not hmac.compare_digest(_sign(f"session.{user_id}.{expires}"), signature):
        return None
    return user_id if expires > (time.time() if now is None else now) else None