import logging

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

from app.utils.mongodb import get_database
from app.models.user import UserInResponse
from app.models.questionnaire import QuestionnaireInResponse


router = APIRouter()


@router.get("/", response_model=UserInResponse, tags=["users"])
async def get_all_users(db: AsyncIOMotorClient = Depends(get_database)) -> UserInResponse:
    """
    Get a list of users in the database

    Each item will have a set of params
    """
    users = []
    rows = db["core"]["users"].find()
    async for row in rows:
        users.append(row)
    return UserInResponse(users=users)


@router.get("/questions/{questions_id}", response_model=QuestionnaireInResponse, tags=["questions"])
async def get_questionnaire(questions_id: str, db: AsyncIOMotorClient = Depends(get_database)) -> QuestionnaireInResponse:
    """
    Retrieve questionnaire given the id


    """
    questionnaire = await db["core"]["questions"].find_one(
        {"_id": questions_id})
    if questionnaire:
        return QuestionnaireInResponse(**questionnaire)
    else:
        raise HTTPException(
            status_code=404, detail=f"Questionnaire {questions_id} not found!")
