"""Cart service: stores pending orders when payment is not complete."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Any, List
from uuid import uuid4
from services.customer_data_service import replace_customer_cart, get_customer_record
from services.inventory_expiry_service import get_nearest_expiry


def add_to_cart(
    db,
    customer_id: str,
    items: List[Dict[str, Any]],
    payment_method: str,
) -> Dict[str, Any]:
    """Add items to cart when payment is incomplete. items = [{"sku": str, "quantity": int}]."""
    # Ensure only one active cart per customer
    try:
        db.cart.delete_many({"customer_id": customer_id, "payment_status": "pending"})
    except Exception:
        pass
    cart_id = f"CART-{uuid4().hex[:8].upper()}"

    # Enrich items with product data (name, price) from catalog
    now = datetime.now(timezone.utc)
    enriched = []
    for it in items:
        sku = it.get("sku", "")
        qty = int(it.get("quantity", 1))
        prod = db.catalog.find_one({"sku": sku}, {"_id": 0})
        price = 0.0
        currency = "USD"
        name = sku
        if prod:
            price = float(prod.get("price") or prod.get("attributes", {}).get("price", 0))
            currency = str(prod.get("currency") or prod.get("attributes", {}).get("currency", "USD"))
            name = prod.get("name", sku)
            if str(prod.get("category", "")).lower() == "grocery":
                nearest_expiry = get_nearest_expiry(db, sku)
                if nearest_expiry and (nearest_expiry.date() - now.date()).days <= 7:
                    price = round(price * 0.85, 2)
        enriched.append({
            "sku": sku,
            "quantity": qty,
            "name": name,
            "price": price,
            "currency": currency,
        })

    cart = {
        "cart_id": cart_id,
        "customer_id": customer_id,
        "items": enriched,
        "payment_method": payment_method,
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc),
    }

    try:
        replace_customer_cart(db, customer_id, cart)
    except Exception:
        pass

    return cart


def get_cart(db, cart_id: str) -> Dict[str, Any] | None:
    """Get cart by cart_id."""
    try:
        # Search across customer collections is expensive; this path is no longer supported.
        return None
    except Exception:
        pass
    return None


def get_carts_by_customer(db, customer_id: str) -> List[Dict[str, Any]]:
    """Get all pending carts for a customer."""
    try:
        cart = get_customer_record(db, customer_id, "cart", "payment_status", "pending")
        return [cart] if cart else []
    except Exception:
        return []
