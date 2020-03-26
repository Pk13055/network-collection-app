from datetime import datetime

from typing import List, Dict
from .base import Base, ObjectID

from bson.objectid import ObjectId


class StateInResponse(Base):
    """Each questionnaire state"""
    state: Dict[str, ObjectID]


class StatesInResponse(Base):
    """The last saved state for a given user"""
    states: Dict[str, StateInResponse]


class Audit(Base):
    """Audit log entry"""

    state: Dict[str, ObjectID]
    questionnaire_id: str
    username: str
    timestamp: datetime = datetime.utcnow()
