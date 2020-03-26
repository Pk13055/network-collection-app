import hashlib
import urllib
import logging
import random

from cas import CASClient
from fastapi import APIRouter, Depends, HTTPException
import jwt
from motor.motor_asyncio import AsyncIOMotorClient
from starlette.responses import RedirectResponse
import ujson

from app.utils.cas import get_cas
from app.utils.token import verify_token
from app.utils.mongodb import get_database
from app.models.user import StateInResponse, Audit
from app.models.questionnaire import QuestionnaireInResponse
from config import SECRET_KEY

router = APIRouter()


@router.get("/login", tags=["auth"])
async def login_route(next: str = "/", ticket: str = None, cas_client: CASClient = Depends(get_cas),
                      db: AsyncIOMotorClient = Depends(get_database)):
    """login using CAS login

    """
    if not ticket:
        # No ticket, the request come from end user, send to CAS login
        cas_login_url = cas_client.get_login_url()
        return RedirectResponse(url=cas_login_url)

    _user, attributes, _ = cas_client.verify_ticket(ticket)
    if not _user:
        return {
            "success": 0,
            "message": "Invalid user! Retry logging in!"
        }
    else:
        logging.debug(f"CAS verify ticket response: user: {_user}")
        username = hashlib.sha256(
            f"{attributes['RollNo']}_{attributes['Name']}::{_user}".encode()).hexdigest()

        existing = await db["core"]["users"].find_one({"username": username})
        if existing:
            await db["core"]["users"].update_one({
                "username": username}, {"$set": {"last_login": attributes["authenticationDate"]}})
        else:
            # add the initial state as unanswered
            mappings = {}
            async for questionnaire in db["core"]["questions"].find():
                default = [option["_id"] for option in questionnaire["options"]
                           if option["label"] == "Unattempted"][0]
                mappings.update({
                    str(questionnaire["_id"]): {
                        str(question["_id"]): default for question in questionnaire["questions"]
                    }
                })

            _res = await db["core"]["users"].insert_one({
                "username": username,
                "last_login": attributes["authenticationDate"],
                "first_login": attributes["authenticationDate"],
                "state": mappings
            })
        jwt_token = jwt.encode({'username': username},
                               str(SECRET_KEY), algorithm="HS256").decode()
        user_response = urllib.parse.urlencode({
            "success": 1,
            "data": urllib.parse.urlencode({
                "username": username,
                "token": jwt_token
            })
        })
        redirect_url = f"{next}#/?user={user_response}"
        return RedirectResponse(url=redirect_url)


@router.get("/questions/{questions_id}", response_model=QuestionnaireInResponse,
            dependencies=[Depends(verify_token)], tags=["questions"])
async def get_questionnaire(questions_id: str,
                            db: AsyncIOMotorClient = Depends(get_database)) -> QuestionnaireInResponse:
    """
    Retrieve questionnaire given the `question_id`

    :param questions_id: str -> ID of the questionnaire, eg: "hums"
    :param db: [AsyncIOMotorClient] -> async db connector
    :returns questionnaire: QuestionnaireInResponse -> relevant questionnaire

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


@router.get("/state/{questions_id}", response_model=StateInResponse, tags=["user", "questions", "state"])
async def get_state(questions_id: str, token: dict = Depends(verify_token),
                    db: AsyncIOMotorClient = Depends(get_database)) -> StateInResponse:
    """
    Retrieve the last saved state of the user

    :param questions_id: str -> ID of the questionnaire, eg: "hums"
    :param db: [AsyncIOMotorClient] -> async db connector
    :returns state: dict[str, int] -> state for the given questionnaire
    """
    questionnaire = await db["core"]["questions"].find_one(
        {"_id": questions_id})
    questionnaire_id = questionnaire["_id"]
    _user = await db["core"]["users"].find_one(token)
    try:
        question_state = _user["state"].get(questionnaire_id, {})
        return StateInResponse(state=question_state)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Questionnaire {questions_id} state not loadable for user! | {e}")


@router.post("/state/{questions_id}", tags=["user", "questions", "state"])
async def set_state(questions_id: str, new_state: StateInResponse, token: dict = Depends(verify_token),
                    db: AsyncIOMotorClient = Depends(get_database)):
    """
    Set the latest state and push update to audit log

    :param questions_id: str -> ID of questionnaire
    :param db: [AsyncIOMotorClient] -> async db connector
    :returns has_saved: dict -> success/failure
    """
    try:
        _res = await db["core"]["users"].update_one(token, {"$set": {
            f"state.{questions_id}": new_state.state
        }})
        audit_entry = Audit(
            username=token['username'], state=new_state.state, questionnaire_id=questions_id)
        _audit_res = await db["core"]["audit"].insert_one(audit_entry.dict())
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Progress not saved! {e}")
