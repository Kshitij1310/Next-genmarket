from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from core.config import settings


def _get_stripe():
    try:
        import stripe  # type: ignore
    except Exception:
        return None
    stripe.api_key = settings.stripe_secret_key
    return stripe


def handle_stripe_event(db, payload: bytes, signature: str, webhook_secret: str) -> bool:
    stripe = _get_stripe()
    if not stripe:
        return False

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=signature,
            secret=webhook_secret,
        )
    except Exception:
        return False

    event_id = event.get("id") if isinstance(event, dict) else getattr(event, "id", None)
    event_type = event.get("type") if isinstance(event, dict) else getattr(event, "type", None)
    data_obj = event.get("data", {}).get("object") if isinstance(event, dict) else getattr(event.data, "object", None)

    # Idempotency guard: ignore already processed webhook events.
    if event_id:
        try:
            existing = db.webhook_events.find_one({"event_id": event_id}, {"_id": 1})
            if existing:
                return True
            db.webhook_events.insert_one(
                {
                    "event_id": event_id,
                    "event_type": event_type,
                    "processed_at": datetime.now(timezone.utc),
                }
            )
        except Exception:
            return False

    if event_type in ("checkout.session.completed", "payment_intent.succeeded"):
        stripe_payment_id = data_obj.get("payment_intent") if isinstance(data_obj, dict) else None
        if not stripe_payment_id and isinstance(data_obj, dict):
            stripe_payment_id = data_obj.get("id")
        stripe_session_id = None
        if event_type == "checkout.session.completed" and isinstance(data_obj, dict):
            stripe_session_id = data_obj.get("id")

        customer_id = None
        cart = None
        if isinstance(data_obj, dict):
            metadata = data_obj.get("metadata") or {}
            cart_id = metadata.get("cart_id")
            customer_id = metadata.get("customer_id")
            if customer_id and cart_id:
                try:
                    cart = db[customer_id].find_one(
                        {"_type": "cart", "cart_id": cart_id, "payment_status": "pending"},
                        {"_id": 0},
                    )
                except Exception:
                    cart = None
            # Backward compatibility: older sessions only had cart_id.
            if not cart and cart_id:
                try:
                    cart = db.cart.find_one({"cart_id": cart_id}, {"_id": 0})
                except Exception:
                    cart = None
                if cart and not customer_id:
                    customer_id = cart.get("customer_id")
            if customer_id and not cart:
                try:
                    cart = db[customer_id].find_one(
                        {"_type": "cart", "payment_status": "pending"},
                        {"_id": 0},
                    )
                except Exception:
                    cart = None

        amount = 0.0
        currency = "USD"
        if isinstance(data_obj, dict):
            amount_total = data_obj.get("amount_total")
            if isinstance(amount_total, (int, float)):
                amount = float(amount_total) / 100.0
            currency = str(data_obj.get("currency") or "usd").upper()

        if stripe_payment_id:
            try:
                db.payments.update_one(
                    {"stripe_payment_id": stripe_payment_id},
                    {
                        "$set": {
                            "stripe_payment_id": stripe_payment_id,
                            "stripe_session_id": stripe_session_id,
                            "status": "confirmed",
                            "customer_id": customer_id,
                            "network": "stripe",
                            "amount": amount,
                            "currency": currency,
                            "updated_at": datetime.now(timezone.utc),
                        }
                    },
                    upsert=True,
                )
            except Exception:
                pass
            if customer_id:
                try:
                    from services.customer_data_service import get_customer_record
                    from services.order_service import create_order
                    from services.payment_service import record_stripe_payment

                    record_stripe_payment(
                        db,
                        stripe_payment_id=stripe_payment_id,
                        status="confirmed",
                        amount=amount,
                        currency=currency,
                        customer_id=customer_id,
                    )

                    # Auto-create order from cart exactly once after successful Stripe payment.
                    already_ordered = db.orders.find_one(
                        {
                            "$or": [
                                {"stripe_payment_id": stripe_payment_id},
                                {"stripe_session_id": stripe_session_id},
                            ]
                        },
                        {"_id": 1},
                    )
                    if already_ordered:
                        return True

                    if not cart:
                        cart = get_customer_record(db, customer_id, "cart", "payment_status", "pending")

                    if cart:
                        items = [{"sku": it["sku"], "quantity": it["quantity"]} for it in cart.get("items", [])]
                        if items:
                            create_order(
                                db,
                                items,
                                customer_id,
                                payment_method="stripe",
                                payment_completed=True,
                                stripe_payment_id=stripe_payment_id,
                                stripe_session_id=stripe_session_id,
                            )
                            # Mark cart as paid so repeated checks don't recreate.
                            try:
                                db[customer_id].update_many(
                                    {"_type": "cart", "cart_id": cart.get("cart_id"), "payment_status": "pending"},
                                    {"$set": {"payment_status": "completed", "stripe_session_id": stripe_session_id}},
                                )
                            except Exception:
                                pass
                            try:
                                db.cart.update_one(
                                    {"cart_id": cart.get("cart_id")},
                                    {"$set": {"payment_status": "completed", "stripe_session_id": stripe_session_id}},
                                )
                            except Exception:
                                pass
                except Exception:
                    pass

    return True
