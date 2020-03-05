import logging
import random

from cas import CASClient
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from starlette.responses import RedirectResponse

from app.utils.cas import get_cas
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


@router.get("/login", tags=["auth"])
async def login_route(next: str = "/", ticket: str = None, cas_client: CASClient = Depends(get_cas), db: AsyncIOMotorClient = Depends(get_database)):
    """login using CAS login

    """
    if not ticket:
        # No ticket, the request come from end user, send to CAS login
        cas_login_url = cas_client.get_login_url()
        logging.debug(f"CAS Login URL {cas_login_url}")
        return RedirectResponse(cas_login_url)

    # There is a ticket, the request come from CAS as callback.
    # need call `verify_ticket()` to validate ticket and get user profile.
    logging.debug(f"Ticket {ticket}")
    logging.debug(f'next {next}')

    user, attributes, pgtiou = cas_client.verify_ticket(ticket)
    logging.debug(
        f"CAS verify ticket response: user: {user}, attributes: {attributes}, pgtiou: {pgtiou}")

    if not user:
        return 'Failed to verify ticket. <a href="/login">Login</a>'
    else:
        # Login successfully, redirect according `next` query parameter.
        # session['username'] = user
        return RedirectResponse(url=next)


@router.get("/questions/{questions_id}", response_model=QuestionnaireInResponse, tags=["questions"])
async def get_questionnaire(questions_id: str, db: AsyncIOMotorClient = Depends(get_database)) -> QuestionnaireInResponse:
    """
    Retrieve questionnaire given the id


    """
    questionnaire = await db["core"]["questions"].find_one(
        {"_id": questions_id})
    if questionnaire:
        if questionnaire['random']:
            random.shuffle(questionnaire['questions'])
        return QuestionnaireInResponse(**questionnaire)
    else:
        raise HTTPException(
            status_code=404, detail=f"Questionnaire {questions_id} not found!")
