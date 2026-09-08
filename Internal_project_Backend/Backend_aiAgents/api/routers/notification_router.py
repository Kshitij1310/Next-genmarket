from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pymongo.database import Database

from core.db import get_db
from core.deps import get_current_user
from core.security import decode_token
from core.ws_hub import ADMIN_CHANNEL, hub, user_channel
from models.schemas import (
    NotificationActionResponse,
    NotificationListResponse,
    NotificationResponse,
)
from services import notification_service as svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _scope_for(user: Dict[str, Any]) -> tuple[str, str]:
    """Return (audience, customer_id) for the caller's token."""
    if user.get("role") == "admin":
        return svc.ADMIN, ""
    return svc.USER, str(user.get("customer_id") or "")


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    limit: int = Query(50, ge=1, le=200),
    db: Database = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
) -> NotificationListResponse:
    audience, customer_id = _scope_for(user)
    items = svc.list_notifications(db, audience, customer_id, limit=limit)
    return NotificationListResponse(
        items=[NotificationResponse(**item) for item in items],
        unread_count=svc.unread_count(db, audience, customer_id),
    )


@router.post("/{notification_id}/read", response_model=NotificationActionResponse)
def mark_read(
    notification_id: str,
    db: Database = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
) -> NotificationActionResponse:
    audience, customer_id = _scope_for(user)
    if not svc.mark_read(db, notification_id, audience, customer_id):
        raise HTTPException(status_code=404, detail="Notification not found")
    return NotificationActionResponse(
        success=True, unread_count=svc.unread_count(db, audience, customer_id)
    )


@router.post("/read-all", response_model=NotificationActionResponse)
def mark_all_read(
    db: Database = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
) -> NotificationActionResponse:
    audience, customer_id = _scope_for(user)
    svc.mark_all_read(db, audience, customer_id)
    return NotificationActionResponse(success=True, unread_count=0)


@router.delete("/{notification_id}", response_model=NotificationActionResponse)
def delete_notification(
    notification_id: str,
    db: Database = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
) -> NotificationActionResponse:
    audience, customer_id = _scope_for(user)
    if not svc.delete_notification(db, notification_id, audience, customer_id):
        raise HTTPException(status_code=404, detail="Notification not found")
    return NotificationActionResponse(
        success=True, unread_count=svc.unread_count(db, audience, customer_id)
    )


@router.delete("", response_model=NotificationActionResponse)
def clear_notifications(
    db: Database = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
) -> NotificationActionResponse:
    audience, customer_id = _scope_for(user)
    svc.clear_notifications(db, audience, customer_id)
    return NotificationActionResponse(success=True, unread_count=0)


# ---------------------------------------------------------------------------
# Live channel
# ---------------------------------------------------------------------------

ws_router = APIRouter()


@ws_router.websocket("/ws/notifications")
async def notifications_socket(websocket: WebSocket, token: str = Query("")) -> None:
    """Push channel for new notifications.

    Browsers cannot set headers on a WebSocket handshake, so the JWT arrives as
    a query parameter and is validated before the socket is accepted.
    """
    try:
        payload = decode_token(token)
    except ValueError:
        await websocket.close(code=4401)
        return

    role = payload.get("role")
    if role == "admin":
        channel = ADMIN_CHANNEL
    elif role == "user":
        customer_id = str(payload.get("customer_id") or "")
        if not customer_id:
            await websocket.close(code=4401)
            return
        channel = user_channel(customer_id)
    else:
        await websocket.close(code=4401)
        return

    await hub.connect(channel, websocket)
    try:
        while True:
            # The client only sends keepalive pings; reading keeps the socket
            # open and surfaces disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug("Notification socket closed unexpectedly", exc_info=True)
    finally:
        hub.disconnect(channel, websocket)
