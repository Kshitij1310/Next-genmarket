"""Order service: creates orders when payment complete, or adds to cart when pending."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Any, List
from uuid import uuid4

from services.payment_service import is_payment_complete
from services.cart_service import add_to_cart
from services.customer_data_service import record_customer_item
from services.inventory_expiry_service import get_nearest_expiry


from services.notification_service import notify_admin, notify_user


def _to_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            pass
    return datetime.max.replace(tzinfo=timezone.utc)


def _allocate_warehouse(db, sku: str, quantity: int) -> str:
    """Find warehouse with sufficient stock for the SKU."""
    try:
        prod = db.catalog.find_one({"sku": sku}, {"_id": 0, "category": 1})
        category = str((prod or {}).get("category", "")).lower()

        inventory_items = list(
            db.inventory_by_warehouse.find(
                {"sku": sku, "qty": {"$gte": quantity}},
                {"_id": 0}
            )
        )

        if category == "grocery" and inventory_items:
            inventory_items = sorted(
                inventory_items,
                key=lambda x: (_to_dt(x.get("expiry_date")), -int(x.get("qty", 0))),
            )
            return inventory_items[0].get("warehouse_code", "WH-N")

        inventory_items = sorted(inventory_items, key=lambda x: -int(x.get("qty", 0)))
        if inventory_items:
            return inventory_items[0].get("warehouse_code", "WH-N")

        any_stock = list(
            db.inventory_by_warehouse.find(
                {"sku": sku, "qty": {"$gt": 0}},
                {"_id": 0}
            )
        )
        if category == "grocery" and any_stock:
            any_stock = sorted(
                any_stock,
                key=lambda x: (_to_dt(x.get("expiry_date")), -int(x.get("qty", 0))),
            )
            return any_stock[0].get("warehouse_code", "WH-N")

        any_stock = sorted(any_stock, key=lambda x: -int(x.get("qty", 0)))

        if any_stock:
            return any_stock[0].get("warehouse_code", "WH-N")

        warehouse = db.warehouses.find_one({}, {"_id": 0})
        if warehouse:
            return warehouse.get("code", "WH-N")

        return "WH-N"
    except Exception:
        return "WH-N"


def _get_product_info(db, sku: str) -> Dict[str, Any]:
    """Get product name, price, currency from catalog."""
    prod = db.catalog.find_one({"sku": sku}, {"_id": 0})
    if prod:
        price = float(prod.get("price") or prod.get("attributes", {}).get("price", 0))
        currency = str(prod.get("currency") or prod.get("attributes", {}).get("currency", "USD"))
        if str(prod.get("category", "")).lower() == "grocery":
            nearest_expiry = get_nearest_expiry(db, sku)
            if nearest_expiry:
                days_to_expiry = (nearest_expiry.date() - datetime.now(timezone.utc).date()).days
                if days_to_expiry <= 7:
                    price = round(price * 0.85, 2)
        return {"name": prod.get("name", sku), "price": price, "currency": currency}
    return {"name": sku, "price": 0.0, "currency": "USD"}


def _store_ordered_products(db, order_id: str, shipment_id: str, items: List[Dict], allocated_warehouse: str) -> None:
    """Store ordered product snapshots in ordered_products collection."""
    now = datetime.now(timezone.utc)
    for it in items:
        sku = it.get("sku", "")
        qty = int(it.get("quantity", 1))
        info = _get_product_info(db, sku)
        doc = {
            "order_id": order_id,
            "shipment_id": shipment_id,
            "sku": sku,
            "quantity": qty,
            "product_name": info["name"],
            "unit_price": info["price"],
            "currency": info["currency"],
            "allocated_warehouse": allocated_warehouse,
            "created_at": now,
        }
        try:
            db.ordered_products.insert_one(doc)
        except Exception:
            pass


def create_order(
    db,
    items: List[Dict[str, Any]],
    customer_id: str,
    payment_method: str = "cash_on_delivery",
    payment_completed: bool = False,
    tx_hash: str | None = None,
    stripe_payment_id: str | None = None,
    stripe_session_id: str | None = None,
) -> Dict[str, Any]:
    """
    Create order or add to cart based on payment status.
    - If payment complete: create order, shipment, ordered_products. Return order_id, shipment_id.
    - If payment incomplete: add to cart. Return cart_id.
    items = [{"sku": str, "quantity": int}]
    """
    payment_ok = is_payment_complete(
        db, payment_method, payment_completed, tx_hash, stripe_payment_id
    )

    if not payment_ok:
        # Store in cart
        cart = add_to_cart(db, customer_id, items, payment_method)
        return {
            "cart_id": cart["cart_id"],
            "order_id": None,
            "shipment_id": None,
            "status": "cart",
            "allocated_warehouse": None,
            "message": "Added to cart. Complete payment to place order.",
        }

    # Payment complete: create order and shipment
    order_id = f"ORD-{uuid4().hex[:8].upper()}"
    shipment_id = f"SHP-{uuid4().hex[:8].upper()}"

    # Use first item for warehouse allocation (simplified; could aggregate)
    first = items[0]
    sku = first.get("sku", "")
    qty = int(first.get("quantity", 1))
    allocated_warehouse = _allocate_warehouse(db, sku, qty)

    payment_status = "completed"
    if payment_method == "cash_on_delivery":
        payment_status = "pending"

    created_at = datetime.now(timezone.utc)
    order = {
        "order_id": order_id,
        "items": items,
        "customer_id": customer_id,
        "status": "confirmed",
        "allocated_warehouse": allocated_warehouse,
        "shipment_id": shipment_id,
        "payment_status": payment_status,
        "payment_method": payment_method,
        "stripe_payment_id": stripe_payment_id,
        "stripe_session_id": stripe_session_id,
        "created_at": created_at,
    }

    try:
        db.orders.insert_one(order)

        db.shipments.update_one(
            {"shipment_id": shipment_id},
            {
                "$set": {
                    "shipment_id": shipment_id,
                    "sku": sku,
                    "warehouse_code": allocated_warehouse,
                    "status": "preparing",
                    "location": allocated_warehouse,
                    "updated_at": datetime.now(timezone.utc),
                    "expected_at": datetime.now(timezone.utc),
                    "eta": datetime.now(timezone.utc),
                    "delayed": False,
                    "source": "order_service",
                }
            },
            upsert=True,
        )

        _store_ordered_products(db, order_id, shipment_id, items, allocated_warehouse)

        # Store order + shipment in per-customer collection
        record_customer_item(db, customer_id, "order", order)
        shipment_doc = {
            "shipment_id": shipment_id,
            "order_id": order_id,
            "sku": sku,
            "warehouse_code": allocated_warehouse,
            "status": "preparing",
            "location": allocated_warehouse,
            "updated_at": datetime.now(timezone.utc),
            "expected_at": datetime.now(timezone.utc),
            "eta": datetime.now(timezone.utc),
            "delayed": False,
            "source": "order_service",
        }
        record_customer_item(db, customer_id, "shipment", shipment_doc)

        item_count = sum(int(i.get("quantity", 1)) for i in items)
        notify_user(
            db,
            customer_id,
            "Order confirmed",
            f"Your order {order_id} ({item_count} item(s)) is confirmed and being prepared.",
            link=f"/orders?order_id={order_id}",
            type="order_created",
        )
        notify_admin(
            db,
            "New order received",
            f"{order_id} from {customer_id} - {item_count} item(s), warehouse {allocated_warehouse}.",
            link=f"/admin/order-management?order_id={order_id}",
            type="order_created",
        )

    except Exception:
        pass

    return {
        "cart_id": None,
        "order_id": order_id,
        "shipment_id": shipment_id,
        "status": "confirmed",
        "allocated_warehouse": allocated_warehouse,
        "created_at": created_at,
        "payment_method": payment_method,
        "payment_id": stripe_payment_id or tx_hash,
        "stripe_payment_id": stripe_payment_id,
        "stripe_session_id": stripe_session_id,
        "message": "Order confirmed. Shipment created.",
    }


def get_order(db, order_id: str) -> Dict[str, Any] | None:
    """Get order by order_id."""
    try:
        order = db.orders.find_one({"order_id": order_id})
        if order:
            # Backfill created_at for legacy orders that were stored without it.
            if not order.get("created_at"):
                oid = order.get("_id")
                if hasattr(oid, "generation_time"):
                    order["created_at"] = oid.generation_time
            order.pop("_id", None)
            return order
    except Exception:
        pass

    return None


def confirm_cod_payment(db, order_id: str) -> Dict[str, Any] | None:
    """
    Admin trigger: confirm COD payment for an already-created order.
    Updates both global orders collection and per-customer order record.
    """
    order = get_order(db, order_id)
    if not order:
        return None

    if order.get("payment_method") != "cash_on_delivery":
        raise ValueError("Order is not COD")

    current_status = str(order.get("payment_status", "")).lower()
    if current_status in {"confirmed", "completed"}:
        return order

    now = datetime.now(timezone.utc)
    update_payload = {
        "payment_status": "confirmed",
        "payment_confirmed_at": now,
    }

    try:
        db.orders.update_one({"order_id": order_id}, {"$set": update_payload})
    except Exception:
        pass

    customer_id = order.get("customer_id")
    if customer_id:
        try:
            db[customer_id].update_many(
                {"_type": "order", "order_id": order_id},
                {"$set": update_payload},
            )
        except Exception:
            pass

    if customer_id:
        notify_user(
            db,
            customer_id,
            "Payment confirmed",
            f"Cash-on-delivery payment for order {order_id} has been confirmed.",
            link=f"/orders?order_id={order_id}",
            type="payment",
        )

    refreshed = get_order(db, order_id)
    return refreshed or {**order, **update_payload}
