"""Notification storage and live delivery.

Documents live in the ``notifications`` collection:

    notification_id  str    stable public id
    audience         str    "admin" | "user"
    customer_id      str    owner for user notifications, "" for admin ones
    type             str    order_created / order_status / payment / stock ...
    title            str
    message          str
    link             str    frontend route to open when the item is clicked
    read             bool
    created_at       datetime
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List
from uuid import uuid4

from core.ws_hub import ADMIN_CHANNEL, hub, user_channel

logger = logging.getLogger(__name__)

ADMIN = "admin"
USER = "user"


def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
    created = doc.get("created_at")
    return {
        "notification_id": doc.get("notification_id", ""),
        "audience": doc.get("audience", USER),
        "type": doc.get("type", "info"),
        "title": doc.get("title", ""),
        "message": doc.get("message", ""),
        "link": doc.get("link", ""),
        "read": bool(doc.get("read", False)),
        "created_at": created.isoformat() if isinstance(created, datetime) else created,
    }


def _scope(audience: str, customer_id: str | None) -> Dict[str, Any]:
    if audience == ADMIN:
        return {"audience": ADMIN}
    return {"audience": USER, "customer_id": customer_id or ""}


def create_notification(
    db,
    audience: str,
    title: str,
    message: str,
    *,
    link: str = "",
    type: str = "info",
    customer_id: str = "",
) -> Dict[str, Any] | None:
    """Persist a notification and push it to any connected client.

    Never raises: a notification failure must not break the action that
    triggered it (placing an order, updating a shipment, ...).
    """
    doc = {
        "notification_id": f"NTF-{uuid4().hex[:10].upper()}",
        "audience": audience,
        "customer_id": "" if audience == ADMIN else (customer_id or ""),
        "type": type,
        "title": title,
        "message": message,
        "link": link,
        "read": False,
        "created_at": datetime.now(timezone.utc),
    }

    try:
        db.notifications.insert_one(dict(doc))
    except Exception:
        logger.exception("Failed to store notification")
        return None

    payload = _serialize(doc)
    channel = ADMIN_CHANNEL if audience == ADMIN else user_channel(doc["customer_id"])
    hub.publish(channel, {"event": "notification", "data": payload})
    return payload


def notify_admin(db, title: str, message: str, **kwargs) -> Dict[str, Any] | None:
    return create_notification(db, ADMIN, title, message, **kwargs)


def notify_user(db, customer_id: str, title: str, message: str, **kwargs) -> Dict[str, Any] | None:
    return create_notification(db, USER, title, message, customer_id=customer_id, **kwargs)


def list_notifications(
    db, audience: str, customer_id: str | None = None, limit: int = 50
) -> List[Dict[str, Any]]:
    cursor = (
        db.notifications.find(_scope(audience, customer_id), {"_id": 0})
        .sort("created_at", -1)
        .limit(max(1, min(limit, 200)))
    )
    return [_serialize(doc) for doc in cursor]


def unread_count(db, audience: str, customer_id: str | None = None) -> int:
    query = _scope(audience, customer_id)
    query["read"] = False
    return int(db.notifications.count_documents(query))


def mark_read(db, notification_id: str, audience: str, customer_id: str | None = None) -> bool:
    query = _scope(audience, customer_id)
    query["notification_id"] = notification_id
    result = db.notifications.update_one(query, {"$set": {"read": True}})
    return result.matched_count > 0


def mark_all_read(db, audience: str, customer_id: str | None = None) -> int:
    query = _scope(audience, customer_id)
    query["read"] = False
    result = db.notifications.update_many(query, {"$set": {"read": True}})
    return int(result.modified_count)


def delete_notification(db, notification_id: str, audience: str, customer_id: str | None = None) -> bool:
    query = _scope(audience, customer_id)
    query["notification_id"] = notification_id
    return db.notifications.delete_one(query).deleted_count > 0


def clear_notifications(db, audience: str, customer_id: str | None = None) -> int:
    return int(db.notifications.delete_many(_scope(audience, customer_id)).deleted_count)
