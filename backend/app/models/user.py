from typing import List
from .base import Base


class UserInResponse(Base):
    """List of users in response"""
    users: List[dict] = []


class StateInResponse(Base):
    """The last saved state for a given questionnaire"""
    questions: dict
