"""Reorder service: check inventory thresholds, predict demand, compute order qty, contact dealers."""

from __future__ import annotations

import logging
import hmac
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from uuid import uuid4

logger = logging.getLogger(__name__)


def _sign_dealer_action(order_id: str, dealer_priority: int, action: str) -> str:
    from core.config import settings
    payload = f"{order_id}:{dealer_priority}:{action}".encode("utf-8")
    secret = settings.jwt_secret.encode("utf-8")
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()


def _verify_dealer_action(order_id: str, dealer_priority: int, action: str, token: str) -> bool:
    expected = _sign_dealer_action(order_id, dealer_priority, action)
    return hmac.compare_digest(expected, token or "")


def _get_category_total(db, warehouse_code: str, category: str) -> int:
    """Sum of all qty for SKUs in this category at this warehouse."""
    items = list(
        db.inventory_by_warehouse.find(
            {"warehouse_code": warehouse_code, "category": category},
            {"qty": 1}
        )
    )
    return sum(int(i.get("qty", 0)) for i in items)


def _get_category_limit(db, warehouse_code: str, category: str) -> int:
    """Max slots for this category at this warehouse."""
    wh = db.warehouses.find_one({"code": warehouse_code}, {"category_limits": 1})
    if not wh:
        return 0
    limits = wh.get("category_limits", {})
    return int(limits.get(category, 0))


def _forecast_demand(db, sku: str) -> float:
    """Predict weekly demand using recent sales history (not aiops_predictions)."""
    history = _get_sales_history(db, sku, limit=8)
    if history:
        avg = sum(history) / max(len(history), 1)
        return float(max(10, round(avg)))
    # Fallback: simple deterministic estimate
    base = sum(ord(c) for c in sku) % 120
    return float(20 + base)


def _get_sales_history(db, sku: str, limit: int = 12) -> List[float]:
    """Get recent sales from ordered_products for demand prediction."""
    try:
        pipeline = [
            {"$match": {"sku": sku}},
            {"$group": {"_id": "$order_id", "qty": {"$sum": "$quantity"}}},
            {"$sort": {"_id": 1}},
            {"$limit": limit},
        ]
        rows = list(db.ordered_products.aggregate(pipeline))
        return [float(r.get("qty", 0)) for r in rows] if rows else []
    except Exception:
        return []


def calc_reorder_qty(
    current_qty: int,
    min_qty: int,
    max_qty: int,
    predicted_demand_week: float,
    category_total: int,
    category_limit: int,
    min_order: int = 5,
) -> int:
    """
    Compute reorder quantity based on demand and capacity.
    - Low demand: order enough to restore to min, between 5 and max_qty
    - High demand: can use empty category slots, order more (e.g. 60-70)
    """
    shortfall = max(0, min_qty - current_qty)
    # Hard category cap enforcement.
    category_headroom = max(0, category_limit - category_total)
    # Do not exceed SKU cap from threshold.
    sku_headroom = max(0, max_qty - current_qty)
    allowed_headroom = min(category_headroom, sku_headroom)

    if shortfall <= 0 or allowed_headroom <= 0:
        return 0

    demand_based_target = max(shortfall, int(round(predicted_demand_week)))
    order = min(allowed_headroom, demand_based_target)

    # Respect minimum reorder size only when it does not violate limits.
    if order < min_order and allowed_headroom >= min_order and shortfall >= min_order:
        order = min_order

    return max(0, int(order))


def validate_inventory_thresholds(db) -> Dict[str, Any]:
    """
    Validate thresholds against warehouse category limits.
    Rules:
    - min_qty <= max_qty
    - max_qty <= category_limit
    - min_qty <= category_limit
    """
    thresholds = list(db.inventory_thresholds.find({}, {"_id": 0}))
    issues: List[Dict[str, Any]] = []

    for th in thresholds:
        warehouse_code = th.get("warehouse_code", "")
        sku = th.get("sku", "")
        category = str(th.get("category", "") or "").strip().lower()
        min_qty = int(th.get("min_qty", 0))
        max_qty = int(th.get("max_qty", 0))
        category_limit = _get_category_limit(db, warehouse_code, category)

        if min_qty > max_qty:
            issues.append(
                {
                    "warehouse_code": warehouse_code,
                    "sku": sku,
                    "category": category,
                    "issue": "min_gt_max",
                    "min_qty": min_qty,
                    "max_qty": max_qty,
                    "category_limit": category_limit,
                }
            )
        if category_limit > 0 and max_qty > category_limit:
            issues.append(
                {
                    "warehouse_code": warehouse_code,
                    "sku": sku,
                    "category": category,
                    "issue": "max_gt_category_limit",
                    "min_qty": min_qty,
                    "max_qty": max_qty,
                    "category_limit": category_limit,
                }
            )
        if category_limit > 0 and min_qty > category_limit:
            issues.append(
                {
                    "warehouse_code": warehouse_code,
                    "sku": sku,
                    "category": category,
                    "issue": "min_gt_category_limit",
                    "min_qty": min_qty,
                    "max_qty": max_qty,
                    "category_limit": category_limit,
                }
            )

    return {
        "count": len(issues),
        "issues": issues,
    }


def get_low_stock_items(db) -> List[Dict[str, Any]]:
    """Find all inventory items below their min_qty threshold."""
    thresholds = list(db.inventory_thresholds.find({}, {"_id": 0}))
    low: List[Dict[str, Any]] = []

    for th in thresholds:
        wh = th.get("warehouse_code", "")
        sku = th.get("sku", "")
        min_qty = int(th.get("min_qty", 0))
        max_qty = int(th.get("max_qty", 0))
        category = th.get("category", "")

        inv = db.inventory_by_warehouse.find_one(
            {"warehouse_code": wh, "sku": sku},
            {"_id": 0, "qty": 1, "product_name": 1}
        )
        current_qty = int(inv.get("qty", 0)) if inv else 0

        if current_qty < min_qty:
            low.append({
                "warehouse_code": wh,
                "sku": sku,
                "product_name": inv.get("product_name", sku) if inv else sku,
                "current_qty": current_qty,
                "min_qty": min_qty,
                "max_qty": max_qty,
                "category": category,
            })

    return low


def get_dealers_for_warehouse(db, warehouse_code: str) -> List[Dict[str, Any]]:
    """Get dealers for warehouse, ordered by priority (1 first, 2 fallback)."""
    return list(
        db.dealers.find(
            {"warehouse_code": warehouse_code},
            {"_id": 0}
        ).sort("dealer_priority", 1)
    )


def send_order_email(
    to_email: str,
    subject: str,
    body: str,
    approve_url: str | None = None,
    reject_url: str | None = None,
) -> bool:
    """
    Send order email to dealer via SMTP.
    Uses config from .env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL.
    Falls back to logging only if SMTP is not configured.
    """
    try:
        from core.config import settings

        if not settings.smtp_user or not settings.smtp_password:
            logger.info(
                "REORDER EMAIL (SMTP not configured): to=%s subject=%s - set SMTP_USER and SMTP_PASSWORD in .env",
                to_email, subject
            )
            return True

        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.smtp_from_email
        msg["To"] = to_email
        msg.attach(MIMEText(body.strip(), "plain", "utf-8"))

        # Optional html part with action buttons.
        if approve_url and reject_url:
            html = f"""
            <html><body>
              <p>{body.replace(chr(10), "<br/>")}</p>
              <p>
                <a href="{approve_url}" style="padding:10px 16px;background:#16a34a;color:white;text-decoration:none;border-radius:6px;margin-right:8px;">Approve</a>
                <a href="{reject_url}" style="padding:10px 16px;background:#dc2626;color:white;text-decoration:none;border-radius:6px;">Reject</a>
              </p>
            </body></html>
            """
            msg.attach(MIMEText(html, "html", "utf-8"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_from_email, [to_email], msg.as_string())

        logger.info("REORDER EMAIL sent to %s: %s", to_email, subject)
        return True

    except Exception as e:
        logger.exception("Failed to send reorder email to %s: %s", to_email, e)
        return False


def _is_replenished(db, warehouse_code: str, sku: str, min_qty: int) -> bool:
    inv = db.inventory_by_warehouse.find_one(
        {"warehouse_code": warehouse_code, "sku": sku},
        {"_id": 0, "qty": 1},
    )
    qty = int(inv.get("qty", 0)) if inv else 0
    return qty >= min_qty


def _log_alert(db, level: str, message: str, **data: Any) -> None:
    try:
        db.alert_events.insert_one(
            {
                "level": level,
                "message": message,
                "data": data,
                "created_at": datetime.now(timezone.utc),
                "source": "reorder_agent",
            }
        )
    except Exception:
        pass


def _send_to_dealer(db, item: Dict[str, Any], dealer: Dict[str, Any], reorder_qty: int) -> bool:
    wh = item["warehouse_code"]
    sku = item["sku"]
    product_name = item["product_name"]
    current_qty = item["current_qty"]
    min_qty = item["min_qty"]
    predicted_demand_week = item["predicted_demand_week"]
    from core.config import settings
    from_email = settings.smtp_from_email

    order_id = item["order_id"]
    dealer_priority = int(dealer.get("dealer_priority", 1))
    approve_token = _sign_dealer_action(order_id, dealer_priority, "approve")
    reject_token = _sign_dealer_action(order_id, dealer_priority, "reject")
    from core.config import settings
    base = settings.api_base_url.rstrip("/")
    approve_url = (
        f"{base}/api/reorder/dealer/respond?order_id={order_id}&dealer_priority={dealer_priority}"
        f"&action=approve&token={approve_token}"
    )
    reject_url = (
        f"{base}/api/reorder/dealer/respond?order_id={order_id}&dealer_priority={dealer_priority}"
        f"&action=reject&token={reject_token}"
    )
    subject = f"Supply Order {order_id} - {product_name} for {wh}"
    body = f"""
Supply Chain Reorder Request

Order ID: {order_id}
Warehouse: {wh}
Product: {product_name} (SKU: {sku})
Quantity: {reorder_qty} units
Current Stock: {current_qty}
Minimum Threshold: {min_qty}
Predicted Weekly Demand: {predicted_demand_week:.0f}

Please confirm availability and delivery timeline.
From: {from_email}
"""
    return send_order_email(
        dealer.get("email", ""),
        subject,
        body,
        approve_url=approve_url,
        reject_url=reject_url,
    )


def _send_to_next_dealer(db, order: Dict[str, Any], now: datetime) -> Dict[str, Any]:
    wh = order["warehouse_code"]
    dealers = get_dealers_for_warehouse(db, wh)
    if len(dealers) < 2:
        _log_alert(db, "error", "Dealer 2 not configured", order_id=order["order_id"], sku=order["sku"], warehouse=wh)
        return {"ok": False, "message": "Dealer 2 not configured"}

    dealer2 = dealers[1]
    sent = _send_to_dealer(db, order, dealer2, int(order["quantity"]))
    db.ai_supply_orders.update_one(
        {"order_id": order["order_id"]},
        {"$set": {
            "dealer_email": dealer2.get("email", ""),
            "dealer_name": dealer2.get("name", "Dealer"),
            "dealer_priority": int(dealer2.get("dealer_priority", 2)),
            "status": "pending_dealer2",
            "dealer1_status": order.get("dealer1_status", "rejected"),
            "dealer2_status": "pending",
            "email_sent": sent,
            "last_contact_at": now,
            "next_check_at": now + timedelta(days=1),
            "updated_at": now,
        }},
    )
    _log_alert(db, "warning", "Dealer 1 rejected; escalated to dealer 2",
               order_id=order["order_id"], sku=order["sku"], warehouse=wh)
    return {"ok": True, "message": "Escalated to dealer 2"}


def process_dealer_response(
    db,
    order_id: str,
    dealer_priority: int,
    action: str,
    token: str,
) -> Dict[str, Any]:
    action = action.lower().strip()
    if action not in {"approve", "reject"}:
        return {"ok": False, "message": "Invalid action"}
    if not _verify_dealer_action(order_id, dealer_priority, action, token):
        return {"ok": False, "message": "Invalid token"}

    order = db.ai_supply_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        return {"ok": False, "message": "Order not found"}

    now = datetime.now(timezone.utc)
    status = order.get("status", "")
    current_priority = int(order.get("dealer_priority", 0))

    if dealer_priority != current_priority:
        return {"ok": False, "message": "This dealer is no longer active for this order"}
    if status not in {"pending_dealer1", "pending_dealer2"}:
        return {"ok": False, "message": f"Order is already in '{status}' state"}

    if action == "approve":
        approve_field = "dealer1_status" if dealer_priority == 1 else "dealer2_status"
        db.ai_supply_orders.update_one(
            {"order_id": order_id},
            {"$set": {
                "status": "active",
                "dealer_decision": "approved",
                approve_field: "approved",
                "approved_by_priority": dealer_priority,
                "approved_at": now,
                "next_check_at": now + timedelta(days=7),
                "updated_at": now,
            }},
        )
        _log_alert(db, "info", "Dealer approved reorder; waiting 1 week",
                   order_id=order_id, sku=order.get("sku"), warehouse=order.get("warehouse_code"))
        return {"ok": True, "message": "Approved. Warehouse will re-check after 1 week.", "status": "active"}

    # reject
    if dealer_priority == 1:
        db.ai_supply_orders.update_one(
            {"order_id": order_id},
            {"$set": {
                "status": "pending_dealer2",
                "dealer_decision": "rejected",
                "dealer1_status": "rejected",
                "rejected_by_priority": 1,
                "rejected_at": now,
                "updated_at": now,
            }},
        )
        result = _send_to_next_dealer(db, order, now)
        return {"ok": True, "message": result["message"], "status": "pending_dealer2"}

    # dealer 2 rejected
    db.ai_supply_orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "status": "waiting_retry",
            "dealer_decision": "rejected",
            "dealer2_status": "rejected",
            "rejected_by_priority": 2,
            "rejected_at": now,
            "next_check_at": now + timedelta(days=7),
            "updated_at": now,
        }},
    )
    _log_alert(db, "error", "Dealer 2 rejected reorder; retry scheduled in 1 week",
               order_id=order_id, sku=order.get("sku"), warehouse=order.get("warehouse_code"))
    return {"ok": True, "message": "Rejected by dealer 2. Retry scheduled in 1 week.", "status": "waiting_retry"}


def process_pending_reorders(db) -> Dict[str, Any]:
    """Process pending AI supply orders for dealer fallback and retry logic."""
    now = datetime.now(timezone.utc)
    processed = 0

    pending = list(
        db.ai_supply_orders.find(
            {"next_check_at": {"$lte": now}, "status": {"$in": ["pending_dealer1", "pending_dealer2", "waiting_retry", "active"]}},
            {"_id": 0},
        )
    )

    for order in pending:
        processed += 1
        wh = order["warehouse_code"]
        sku = order["sku"]
        min_qty = int(order.get("min_qty", 0))

        # If replenished, mark success
        if _is_replenished(db, wh, sku, min_qty):
            try:
                db.ai_supply_orders.update_one(
                    {"order_id": order["order_id"]},
                    {"$set": {"status": "fulfilled", "fulfilled_at": now}},
                )
            except Exception:
                pass
            _log_alert(db, "info", "Reorder fulfilled", order_id=order["order_id"], sku=sku, warehouse=wh)
            continue

        # Not replenished: handle escalation
        dealers = get_dealers_for_warehouse(db, wh)
        if not dealers:
            _log_alert(db, "error", "No dealers configured", sku=sku, warehouse=wh)
            continue

        if order["status"] == "pending_dealer1":
            # Escalate to dealer 2
            try:
                db.ai_supply_orders.update_one(
                    {"order_id": order["order_id"]},
                    {"$set": {"dealer1_status": "no_response", "updated_at": now}},
                )
            except Exception:
                pass
            _send_to_next_dealer(db, order, now)

        elif order["status"] == "pending_dealer2":
            # Both dealers failed -> wait 1 week then retry
            try:
                db.ai_supply_orders.update_one(
                    {"order_id": order["order_id"]},
                    {"$set": {
                        "status": "waiting_retry",
                        "next_check_at": now + timedelta(days=7),
                    }},
                )
            except Exception:
                pass
            _log_alert(db, "error", "Dealer 2 did not respond; retry scheduled in 1 week",
                       order_id=order["order_id"], sku=sku, warehouse=wh)

        elif order["status"] == "active":
            # Approved order waited 1 week but not replenished: retry with dealer 1.
            predicted = _forecast_demand(db, sku)
            try:
                db.ai_supply_orders.update_one(
                    {"order_id": order["order_id"]},
                    {"$set": {
                        "status": "waiting_retry",
                        "next_check_at": now,
                        "predicted_demand_week": predicted,
                        "updated_at": now,
                    }},
                )
            except Exception:
                pass
            _log_alert(db, "warning", "Approved reorder not replenished after 1 week; moving to retry",
                       order_id=order["order_id"], sku=sku, warehouse=wh)

        elif order["status"] == "waiting_retry":
            # Retry with dealer 1 using fresh prediction
            predicted = _forecast_demand(db, sku)
            dealer = dealers[0]
            order_for_email = dict(order)
            order_for_email["predicted_demand_week"] = predicted
            sent = _send_to_dealer(db, order_for_email, dealer, int(order["quantity"]))
            try:
                db.ai_supply_orders.update_one(
                    {"order_id": order["order_id"]},
                    {"$set": {
                        "dealer_email": dealer.get("email", ""),
                        "dealer_name": dealer.get("name", "Dealer"),
                        "dealer_priority": dealer.get("dealer_priority", 1),
                        "status": "pending_dealer1",
                        "dealer1_status": "pending",
                        "dealer2_status": "idle",
                        "email_sent": sent,
                        "last_contact_at": now,
                        "next_check_at": now + timedelta(days=1),
                        "predicted_demand_week": predicted,
                    }},
                )
            except Exception:
                pass
            _log_alert(db, "info", "Retrying reorder after 1 week", sku=sku, warehouse=wh)

    return {"processed": processed}


def run_reorder_cycle(db) -> Dict[str, Any]:
    """
    Full reorder cycle: check low stock, predict demand, compute order qty,
    contact dealers, store in ai_supply_orders.
    """
    low = get_low_stock_items(db)
    orders_created: List[Dict[str, Any]] = []

    for item in low:
        wh = item["warehouse_code"]
        sku = item["sku"]
        current_qty = item["current_qty"]
        min_qty_raw = int(item["min_qty"])
        max_qty_raw = int(item["max_qty"])
        category = item["category"]
        product_name = item["product_name"]

        # Category capacity
        category_total = _get_category_total(db, wh, category)
        category_limit = _get_category_limit(db, wh, category)
        if category_limit <= 0:
            _log_alert(
                db,
                "warning",
                "Skipped reorder: category limit missing or zero",
                sku=sku,
                warehouse=wh,
                category=category,
            )
            continue

        # Sanitize thresholds against category limits.
        max_qty = min(max_qty_raw, category_limit)
        min_qty = min(min_qty_raw, max_qty)
        if max_qty != max_qty_raw or min_qty != min_qty_raw:
            _log_alert(
                db,
                "warning",
                "Threshold adjusted to fit category limits",
                sku=sku,
                warehouse=wh,
                category=category,
                min_qty_raw=min_qty_raw,
                max_qty_raw=max_qty_raw,
                min_qty=min_qty,
                max_qty=max_qty,
                category_limit=category_limit,
            )

        if current_qty >= min_qty:
            continue

        # Demand prediction
        predicted_demand_week = _forecast_demand(db, sku)

        # Calculate reorder qty
        reorder_qty = calc_reorder_qty(
            current_qty, min_qty, max_qty,
            predicted_demand_week,
            category_total, category_limit,
        )

        if reorder_qty <= 0:
            continue

        # Avoid duplicate active reorder threads and repeated mails every scheduler tick.
        open_reorder = db.ai_supply_orders.find_one(
            {
                "warehouse_code": wh,
                "sku": sku,
                "status": {"$in": ["pending_dealer1", "pending_dealer2", "active", "waiting_retry"]},
            },
            {"_id": 0, "order_id": 1, "status": 1},
        )
        if open_reorder:
            continue

        # Get dealers
        dealers = get_dealers_for_warehouse(db, wh)
        if not dealers:
            continue

        # Contact dealer (primary first) using helper so email contains Approve/Reject links.
        dealer = dealers[0]
        dealer_email = dealer.get("email", "")
        dealer_name = dealer.get("name", "Dealer")
        order_id = f"REO-{uuid4().hex[:8].upper()}"
        email_item = {
            "order_id": order_id,
            "warehouse_code": wh,
            "sku": sku,
            "product_name": product_name,
            "quantity": reorder_qty,
            "current_qty": current_qty,
            "min_qty": min_qty,
            "predicted_demand_week": predicted_demand_week,
        }
        sent = _send_to_dealer(db, email_item, dealer, reorder_qty)

        order_doc = {
            "order_id": order_id,
            "warehouse_code": wh,
            "sku": sku,
            "product_name": product_name,
            "quantity": reorder_qty,
            "current_qty": current_qty,
            "min_qty": min_qty,
            "max_qty": max_qty,
            "predicted_demand_week": predicted_demand_week,
            "dealer_email": dealer_email,
            "dealer_name": dealer_name,
            "dealer_priority": dealer.get("dealer_priority", 1),
            "email_sent": sent,
            "status": "pending_dealer1",
            "dealer1_status": "pending",
            "dealer2_status": "idle",
            "source": "reorder_agent",
            "created_at": datetime.now(timezone.utc),
            "last_contact_at": datetime.now(timezone.utc),
            "next_check_at": datetime.now(timezone.utc) + timedelta(days=1),
        }

        try:
            db.ai_supply_orders.insert_one(order_doc)
            orders_created.append({
                "order_id": order_id,
                "warehouse_code": wh,
                "sku": sku,
                "quantity": reorder_qty,
                "dealer_email": dealer_email,
            })
        except Exception as e:
            logger.exception("Failed to store ai_supply_order: %s", e)

    return {
        "low_stock_count": len(low),
        "orders_created": len(orders_created),
        "orders": orders_created,
    }
