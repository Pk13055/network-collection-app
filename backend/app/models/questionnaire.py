from typing import List, Optional
from .base import Base


class QuestionnaireInResponse(Base):
    __id: str
    type: str = "intra"
    questions: List[dict]
    random: bool = True
    options: List[dict]
    weights: Optional[dict] = {}
    optional: bool = False
    title: str = "Questionnaire"
