from typing import List, Optional

from pydantic import Field
from pydantic.dataclasses import dataclass

from .base import Base, ObjectID


class Option(Base):
    label: str
    k: int
    id: ObjectID = Field(None, alias="_id")


class Question(Base):
    description: str
    k: int
    id: ObjectID = Field(None, alias="_id")


class QuestionnaireInResponse(Base):
    id: str = Field(None, alias="_id")
    title: str = "Questionnaire"
    questions: List[Question]
    random: bool = True
    options: List[Option]
    weights: Optional[dict] = {}
    type: str = "intra"
    optional: bool = False
