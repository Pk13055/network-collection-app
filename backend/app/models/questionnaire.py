from typing import List, Optional

from bson.objectid import ObjectId

from .base import Base


class Option(Base):
    _id: ObjectId
    label: str
    k: int


class Question(Base):
    _id: ObjectId
    description: str
    k: int


class QuestionnaireInResponse(Base):
    _id: str
    title: str = "Questionnaire"
    questions: List[Question]
    random: bool = True
    options: List[Option]
    weights: Optional[dict] = {}
    type: str = "intra"
    optional: bool = False
