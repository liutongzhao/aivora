"""SQLAlchemy table mappings are added alongside their business modules."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass

