from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4


def _as_utc_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if len(text) == 10:
            text = f"{text}T00:00:00+00:00"
        text = text.replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(text)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


def _is_grocery(db, sku: str) -> bool:
    row = db.catalog.find_one({"sku": sku}, {"_id": 0, "category": 1})
    return str((row or {}).get("category", "")).lower() == "grocery"


def _catalog_expiry(db, sku: str) -> Optional[datetime]:
    row = db.catalog.find_one({"sku": sku}, {"_id": 0, "expiry_date": 1, "attributes": 1})
    if not row:
        return None
    expiry = row.get("expiry_date")
    if not expiry and isinstance(row.get("attributes"), dict):
        expiry = row["attributes"].get("expiry_date")
    return _as_utc_datetime(expiry)


def _sync_inventory_row_from_batches(db, warehouse_code: str, sku: str) -> Dict[str, Any]:
    batches = list(
        db.inventory_batches.find(
            {"warehouse_code": warehouse_code, "sku": sku, "qty": {"$gt": 0}},
            {"_id": 0, "qty": 1, "expiry_date": 1},
        ).sort("expiry_date", 1)
    )
    total_qty = sum(int(b.get("qty", 0)) for b in batches)
    nearest_expiry = None
    for b in batches:
        nearest_expiry = _as_utc_datetime(b.get("expiry_date"))
        if nearest_expiry:
            break

    payload: Dict[str, Any] = {
        "qty": total_qty,
        "updated_at": datetime.now(timezone.utc),
    }
    if nearest_expiry:
        payload["expiry_date"] = nearest_expiry
    else:
        payload["expiry_date"] = None

    db.inventory_by_warehouse.update_one(
        {"warehouse_code": warehouse_code, "sku": sku},
        {"$set": payload},
        upsert=False,
    )
    return {"qty": total_qty, "expiry_date": nearest_expiry}


def _bootstrap_batch_if_missing(db, warehouse_code: str, sku: str) -> None:
    if not _is_grocery(db, sku):
        return

    has_batches = db.inventory_batches.count_documents(
        {"warehouse_code": warehouse_code, "sku": sku},
        limit=1,
    )
    if has_batches:
        return

    inv = db.inventory_by_warehouse.find_one(
        {"warehouse_code": warehouse_code, "sku": sku},
        {"_id": 0, "qty": 1, "expiry_date": 1},
    )
    if not inv:
        return
    qty = int(inv.get("qty", 0))
    if qty <= 0:
        return

    expiry_dt = _as_utc_datetime(inv.get("expiry_date")) or _catalog_expiry(db, sku)
    if not expiry_dt:
        return

    db.inventory_batches.insert_one(
        {
            "batch_id": f"BCH-{uuid4().hex[:10].upper()}",
            "warehouse_code": warehouse_code,
            "sku": sku,
            "qty": qty,
            "expiry_date": expiry_dt,
            "created_at": datetime.now(timezone.utc),
            "source": "bootstrap",
            "status": "active",
        }
    )
    _sync_inventory_row_from_batches(db, warehouse_code, sku)


def get_nearest_expiry(db, sku: str) -> Optional[datetime]:
    # Prefer batch-level truth (FEFO source).
    batch = db.inventory_batches.find_one(
        {"sku": sku, "qty": {"$gt": 0}},
        {"_id": 0, "expiry_date": 1},
        sort=[("expiry_date", 1)],
    )
    if batch:
        dt = _as_utc_datetime(batch.get("expiry_date"))
        if dt:
            return dt

    row = db.inventory_by_warehouse.find_one(
        {"sku": sku, "qty": {"$gt": 0}, "expiry_date": {"$exists": True, "$ne": None}},
        {"_id": 0, "expiry_date": 1},
        sort=[("expiry_date", 1)],
    )
    if row:
        return _as_utc_datetime(row.get("expiry_date"))
    return None


def add_inventory_batch(
    db,
    warehouse_code: str,
    sku: str,
    quantity: int,
    expiry_date: datetime | str,
    source: str = "restock",
) -> Dict[str, Any]:
    if quantity <= 0:
        raise ValueError("quantity must be > 0")
    if not _is_grocery(db, sku):
        raise ValueError("batch expiry tracking is enabled for grocery items only")

    expiry_dt = _as_utc_datetime(expiry_date)
    if not expiry_dt:
        raise ValueError("invalid expiry_date")

    # One logical batch per same expiry date.
    db.inventory_batches.update_one(
        {
            "warehouse_code": warehouse_code,
            "sku": sku,
            "expiry_date": expiry_dt,
            "status": "active",
        },
        {
            "$inc": {"qty": int(quantity)},
            "$setOnInsert": {
                "batch_id": f"BCH-{uuid4().hex[:10].upper()}",
                "warehouse_code": warehouse_code,
                "sku": sku,
                "created_at": datetime.now(timezone.utc),
                "source": source,
                "status": "active",
            },
            "$set": {"updated_at": datetime.now(timezone.utc)},
        },
        upsert=True,
    )

    sync = _sync_inventory_row_from_batches(db, warehouse_code, sku)
    return {
        "warehouse_code": warehouse_code,
        "sku": sku,
        "added_qty": int(quantity),
        "expiry_date": expiry_dt,
        "current_qty": sync.get("qty", 0),
        "nearest_expiry_date": sync.get("expiry_date"),
    }


def consume_inventory_fefo(db, warehouse_code: str, sku: str, quantity: int) -> Dict[str, Any]:
    if quantity <= 0:
        return {"requested_qty": 0, "consumed_qty": 0, "remaining_qty": 0, "batches": []}

    if not _is_grocery(db, sku):
        row = db.inventory_by_warehouse.find_one(
            {"warehouse_code": warehouse_code, "sku": sku},
            {"_id": 0, "qty": 1},
        )
        available = int((row or {}).get("qty", 0))
        consume = min(available, int(quantity))
        db.inventory_by_warehouse.update_one(
            {"warehouse_code": warehouse_code, "sku": sku},
            {"$set": {"qty": max(0, available - consume), "updated_at": datetime.now(timezone.utc)}},
            upsert=False,
        )
        return {
            "requested_qty": int(quantity),
            "consumed_qty": consume,
            "remaining_qty": max(0, available - consume),
            "batches": [],
        }

    _bootstrap_batch_if_missing(db, warehouse_code, sku)

    batches = list(
        db.inventory_batches.find(
            {"warehouse_code": warehouse_code, "sku": sku, "qty": {"$gt": 0}},
            {"_id": 0, "batch_id": 1, "qty": 1, "expiry_date": 1},
        ).sort([("expiry_date", 1), ("created_at", 1)])
    )

    remaining = int(quantity)
    used: List[Dict[str, Any]] = []
    for batch in batches:
        if remaining <= 0:
            break
        batch_qty = int(batch.get("qty", 0))
        if batch_qty <= 0:
            continue
        take = min(batch_qty, remaining)
        new_qty = batch_qty - take
        remaining -= take

        update_payload: Dict[str, Any] = {"qty": new_qty, "updated_at": datetime.now(timezone.utc)}
        if new_qty == 0:
            update_payload["status"] = "depleted"
            update_payload["depleted_at"] = datetime.now(timezone.utc)
        db.inventory_batches.update_one(
            {"warehouse_code": warehouse_code, "sku": sku, "batch_id": batch.get("batch_id")},
            {"$set": update_payload},
            upsert=False,
        )
        used.append(
            {
                "batch_id": batch.get("batch_id"),
                "consumed_qty": take,
                "expiry_date": _as_utc_datetime(batch.get("expiry_date")),
            }
        )

    sync = _sync_inventory_row_from_batches(db, warehouse_code, sku)
    return {
        "requested_qty": int(quantity),
        "consumed_qty": int(quantity) - remaining,
        "remaining_qty": sync.get("qty", 0),
        "batches": used,
    }

def shortlist_grocery_expiry_alerts(
    db,
    warehouse_code: str | None = None,
    shortlist_weeks: int = 7,
    sale_trigger_days: int = 7,
    persist_alerts: bool = True,) -> Dict[str, Any]:
    """
    Shortlist grocery products close to expiry by warehouse.
    - shortlist window: N weeks (default 7 weeks)
    - sale trigger: discount starts N days before expiry (default 7 days)
    """
    if shortlist_weeks <= 0:
        raise ValueError("shortlist_weeks must be > 0")
    if sale_trigger_days <= 0:
        raise ValueError("sale_trigger_days must be > 0")

    shortlist_days = shortlist_weeks * 7
    now = datetime.now(timezone.utc)
    today = now.date()

    grocery_rows = list(
        db.catalog.find(
            {"category": {"$regex": "^grocery$", "$options": "i"}},
            {"_id": 0, "sku": 1, "name": 1},
        )
    )
    grocery_by_sku = {str(r.get("sku")): r for r in grocery_rows if r.get("sku")}

    inv_query: Dict[str, Any] = {"qty": {"$gt": 0}}
    if warehouse_code:
        inv_query["warehouse_code"] = warehouse_code

    inv_rows = list(
        db.inventory_by_warehouse.find(
            inv_query,
            {"_id": 0, "warehouse_code": 1, "sku": 1, "qty": 1, "expiry_date": 1},
        )
    )

    items: List[Dict[str, Any]] = []
    for row in inv_rows:
        sku = str(row.get("sku", ""))
        wh = str(row.get("warehouse_code", ""))
        if not sku or not wh or sku not in grocery_by_sku:
            continue

        expiry_dt = _as_utc_datetime(row.get("expiry_date")) or _catalog_expiry(db, sku)
        if not expiry_dt:
            continue

        days_to_expiry = (expiry_dt.date() - today).days
        if days_to_expiry > shortlist_days:
            continue

        days_left_for_sale_trigger = max(days_to_expiry - sale_trigger_days, 0)
        sale_status = "discount_active" if days_to_expiry <= sale_trigger_days else "upcoming"
        item = {
            "warehouse_code": wh,
            "sku": sku,
            "product_name": grocery_by_sku[sku].get("name", sku),
            "quantity": int(row.get("qty", 0)),
            "expiry_date": expiry_dt,
            "days_to_expiry": days_to_expiry,
            "sale_trigger_days": sale_trigger_days,
            "days_left_for_sale_trigger": days_left_for_sale_trigger,
            "sale_status": sale_status,
        }
        items.append(item)

        if persist_alerts:
            alert_key = f"expiry:{wh}:{sku}:{expiry_dt.date().isoformat()}"
            level = "warning" if sale_status == "discount_active" else "info"
            msg = (
                f"{sku} in {wh} reached sale window ({days_to_expiry} days to expiry)"
                if sale_status == "discount_active"
                else f"{sku} in {wh} is within {shortlist_weeks} weeks to expiry"
            )
            db.alert_events.update_one(
                {"source": "expiry_agent", "data.alert_key": alert_key},
                {
                    "$set": {
                        "level": level,
                        "message": msg,
                        "data": {
                            "alert_key": alert_key,
                            "warehouse_code": wh,
                            "sku": sku,
                            "product_name": grocery_by_sku[sku].get("name", sku),
                            "quantity": int(row.get("qty", 0)),
                            "expiry_date": expiry_dt,
                            "days_to_expiry": days_to_expiry,
                            "sale_trigger_days": sale_trigger_days,
                            "days_left_for_sale_trigger": days_left_for_sale_trigger,
                            "sale_status": sale_status,
                        },
                        "updated_at": now,
                    },
                    "$setOnInsert": {"created_at": now},
                },
                upsert=True,
            )

    items.sort(key=lambda x: (x["days_to_expiry"], x["warehouse_code"], x["sku"]))

    return {
        "warehouse_code": warehouse_code,
        "shortlist_weeks": shortlist_weeks,
        "sale_trigger_days": sale_trigger_days,
        "count": len(items),
        "items": items,
    }


def list_grocery_expiry_alerts(
    db,
    warehouse_code: str | None = None,
    sale_status: str | None = None,
    limit: int = 200,
) -> Dict[str, Any]:
    """
    Read persisted expiry alerts from alert_events for grocery products.
    Recomputes days_to_expiry and sale_status based on current date.
    """
    if limit <= 0:
        raise ValueError("limit must be > 0")

    query: Dict[str, Any] = {"source": "expiry_agent"}
    if warehouse_code:
        query["data.warehouse_code"] = warehouse_code

    rows = list(
        db.alert_events.find(
            query,
            {"_id": 0, "level": 1, "message": 1, "data": 1, "created_at": 1, "updated_at": 1},
        ).sort([("updated_at", -1), ("created_at", -1)]).limit(limit)
    )

    today = datetime.now(timezone.utc).date()
    items: List[Dict[str, Any]] = []
    for row in rows:
        data = row.get("data", {}) or {}
        expiry_dt = _as_utc_datetime(data.get("expiry_date"))
        if not expiry_dt:
            continue

        sale_trigger_days = int(data.get("sale_trigger_days", 7) or 7)
        days_to_expiry = (expiry_dt.date() - today).days
        days_left_for_sale_trigger = max(days_to_expiry - sale_trigger_days, 0)
        computed_sale_status = "discount_active" if days_to_expiry <= sale_trigger_days else "upcoming"

        if sale_status and computed_sale_status != sale_status:
            continue

        items.append(
            {
                "warehouse_code": data.get("warehouse_code"),
                "sku": data.get("sku"),
                "product_name": data.get("product_name"),
                "quantity": int(data.get("quantity", 0) or 0),
                "expiry_date": expiry_dt,
                "days_to_expiry": days_to_expiry,
                "sale_trigger_days": sale_trigger_days,
                "days_left_for_sale_trigger": days_left_for_sale_trigger,
                "sale_status": computed_sale_status,
                "level": row.get("level"),
                "message": row.get("message"),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            }
        )

    items.sort(key=lambda x: (x["days_to_expiry"], str(x.get("warehouse_code", "")), str(x.get("sku", ""))))

    return {
        "warehouse_code": warehouse_code,
        "sale_status": sale_status,
        "count": len(items),
        "items": items,
    }
