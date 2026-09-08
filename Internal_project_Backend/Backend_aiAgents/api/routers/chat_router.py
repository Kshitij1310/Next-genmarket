from fastapi import APIRouter, Depends
from pymongo.database import Database

from core.deps import get_current_user
from core.db import get_db
from models.schemas import ChatRequest, ChatResponse
from services.chat_service import handle_chat

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
def chat(
    req: ChatRequest,
    db: Database = Depends(get_db),
    _user: dict = Depends(get_current_user),
) -> ChatResponse:
    response = handle_chat(db, req.message)
    return ChatResponse(
        reply=response["reply"],
        intent=response["intent"],
        confidence=float(response["confidence"]),
    )
