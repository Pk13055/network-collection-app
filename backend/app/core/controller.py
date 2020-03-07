import hashlib
import logging
import random

from cas import CASClient
from fastapi import APIRouter, Depends, HTTPException
import jwt
from motor.motor_asyncio import AsyncIOMotorClient
from starlette.responses import RedirectResponse
import ujson

from app.utils.cas import get_cas
from app.utils.mongodb import get_database
from app.models.user import UserInResponse
from app.models.questionnaire import QuestionnaireInResponse
from config import SECRET_KEY

router = APIRouter()


@router.get("/login", tags=["auth"])
async def login_route(next: str = "/", ticket: str = None, cas_client: CASClient = Depends(get_cas), db: AsyncIOMotorClient = Depends(get_database)):
    """login using CAS login

    """
    if not ticket:
        # No ticket, the request come from end user, send to CAS login
        cas_login_url = cas_client.get_login_url()
        logging.debug(f"CAS Login URL {cas_login_url}")
        return RedirectResponse(url=cas_login_url)

    _user, attributes, _ = cas_client.verify_ticket(ticket)
    if not _user:
        return {
            "success": False,
            "message": "Invalid user! Retry logging in!"
        }
    else:
        logging.debug(f"CAS verify ticket response: user: {_user}")
        username = hashlib.sha256(
            f"{attributes['RollNo']}_{attributes['Name']}::{_user}".encode()).hexdigest()

        existing = await db["core"]["users"].find_one({"username": username})
        if existing:
            await db["core"]["users"].update_one({"username": username}, {"$set": {"last_login": attributes["authenticationDate"]}})
        else:
            _res = await db["core"]["users"].insert_one({
                "username": username,
                "last_login": attributes["authenticationDate"],
                "first_login": attributes["authenticationDate"]
            })
        jwt_token = jwt.encode({'username': username},
                               str(SECRET_KEY), algorithm="HS256").decode()
        user_response = {
            "success": True,
            "data": {
                "username": username,
                "token": jwt_token
            }
        }
        redirect_url = f"{next}#/?user={user_response}"
        return RedirectResponse(url=redirect_url)


@router.get("/questions/{questions_id}", response_model=QuestionnaireInResponse, tags=["questions"])
async def get_questionnaire(request, questions_id: str, db: AsyncIOMotorClient = Depends(get_database)) -> QuestionnaireInResponse:
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
