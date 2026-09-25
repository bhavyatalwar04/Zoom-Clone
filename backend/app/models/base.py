import enum

from sqlalchemy import Enum


def db_enum(enum_cls: type[enum.Enum], name: str) -> Enum:
    """Store the lowercase value ("live") rather than the member name ("LIVE"), as plain text."""
    return Enum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e], native_enum=False)
