"""Shared SQLAlchemy declarative base.

Runtime mappings live in business modules; database structure remains owned by
Flyway migrations.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
