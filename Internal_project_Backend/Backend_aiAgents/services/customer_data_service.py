from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict


def _collection(db, customer_id: str):
    return db[customer_id]


def ensure_customer_collection(db, customer_id: str) -> None:
    """Create a per-customer collection with a meta document if not present."""
    coll = _collection(db, customer_id)
    try:
        exists = coll.find_one({"_type": "meta"}, {"_id": 1})
        if not exists:
            coll.insert_one(
                {"_type": "meta", "customer_id": customer_id, "created_at": datetime.now(timezone.utc)}
            )
    except Exception:
        pass


def record_customer_item(db, customer_id: str, item_type: str, payload: Dict[str, Any]) -> None:
    """Store a typed record in the per-customer collection."""
    if not customer_id:
        return
    ensure_customer_collection(db, customer_id)
    doc = {
        "_type": item_type,
        "customer_id": customer_id,
        "created_at": datetime.now(timezone.utc),
        **payload,
    }
    try:
        _collection(db, customer_id).insert_one(doc)
    except Exception:
        pass


def replace_customer_cart(db, customer_id: str, cart_doc: Dict[str, Any]) -> None:
    """Ensure only one active cart in per-customer collection."""
    if not customer_id:
        return
    ensure_customer_collection(db, customer_id)
    try:
        _collection(db, customer_id).delete_many({"_type": "cart", "payment_status": "pending"})
    except Exception:
        pass
    record_customer_item(db, customer_id, "cart", cart_doc)


def get_customer_record(db, customer_id: str, item_type: str, key: str, value: str) -> Dict[str, Any] | None:
    """Fetch a single record from per-customer collection."""
    try:
        return _collection(db, customer_id).find_one(
            {"_type": item_type, key: value},
            {"_id": 0},
        )
    except Exception:
        return None
