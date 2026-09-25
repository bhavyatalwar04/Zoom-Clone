"""Application settings, loaded from environment variables (or a local .env file)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Zoom Clone API"
    database_url: str = "sqlite:///./zoom_clone.db"

    # Used to build shareable invite links, e.g. http://localhost:3000/j/84523910472?pwd=abc123
    frontend_url: str = "http://localhost:3000"

    # Comma separated list of origins allowed to call the API from a browser.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Secret used to sign the short-lived tokens that authorise a WebSocket connection.
    secret_key: str = "dev-secret-change-me"

    # No authentication: every request is made on behalf of this (seeded) user.
    default_user_email: str = "bhavya.talwar@example.com"

    # Seed the database with sample data on startup when it is empty.
    seed_on_startup: bool = True

    # How long a room may sit empty before the meeting is marked as ended.
    empty_room_grace_seconds: int = 20

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
