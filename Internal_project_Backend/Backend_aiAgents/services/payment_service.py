"""Payment service: supports cash_on_delivery, Stripe, Ethereum (ETH), Polygon (Matic)."""

from __future__ import annotations

from typing import Dict, Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from core.config import settings


PAYMENT_METHODS = {"cash_on_delivery", "stripe", "eth", "matic"}


def get_payment_status(db, tx_hash: str) -> Dict[str, Any] | None:
    """Get payment status by tx_hash (for ETH/Matic)."""
    try:
        payment = db.payments.find_one({"tx_hash": tx_hash}, {"_id": 0})
        if payment:
            return payment
    except Exception:
        pass

    return None


def get_stripe_payment(db, stripe_payment_id: str) -> Dict[str, Any] | None:
    """Get payment status by Stripe payment intent id."""
    try:
        payment = db.payments.find_one({"stripe_payment_id": stripe_payment_id}, {"_id": 0})
        if payment:
            return payment
    except Exception:
        pass
    return None


def _get_stripe_client():
    if not settings.stripe_secret_key:
        return None
    try:
        import stripe  # type: ignore
    except Exception:
        return None
    stripe.api_key = settings.stripe_secret_key
    return stripe


def validate_stripe_payment(db, stripe_payment_id: str) -> bool:
    """
    Check if Stripe payment is confirmed.
    Priority:
      1) MongoDB (allows test data)
      2) Stripe API (if configured), then persist to DB when confirmed
    """
    # First: trust recorded payments in MongoDB (webhook/test data)
    try:
        payment = db.payments.find_one(
            {"stripe_payment_id": stripe_payment_id, "status": "confirmed"},
            {"_id": 1}
        )
        if payment is not None:
            return True
    except Exception:
        pass

    # Second: verify against Stripe if key is configured
    stripe = _get_stripe_client()
    if stripe:
        try:
            intent = stripe.PaymentIntent.retrieve(stripe_payment_id)
            status = intent.get("status") if isinstance(intent, dict) else getattr(intent, "status", None)
            if status == "succeeded":
                # Persist confirmation so future checks can use DB
                try:
                    db.payments.update_one(
                        {"stripe_payment_id": stripe_payment_id},
                        {"$set": {"stripe_payment_id": stripe_payment_id, "status": "confirmed"}},
                        upsert=True,
                    )
                except Exception:
                    pass
                return True
            return False
        except Exception:
            return False

    return False


def validate_crypto_payment(db, tx_hash: str, network: str) -> bool:
    """Check if ETH or Matic payment is confirmed."""
    if network.lower() not in ("eth", "ethereum", "matic", "polygon"):
        return False
    payment = get_payment_status(db, tx_hash)
    if not payment:
        return False
    net = str(payment.get("network", "")).lower()
    return net in ("eth", "ethereum", "matic", "polygon") and payment.get("status") == "confirmed"


def is_payment_complete(
    db,
    payment_method: str,
    payment_completed: bool,
    tx_hash: str | None = None,
    stripe_payment_id: str | None = None,
) -> bool:
    """
    Determine if payment is complete for order creation.
    - cash_on_delivery: always True (order placed, pay on delivery)
    - stripe: payment_completed and valid stripe_payment_id
    - eth/matic: payment_completed and validated tx_hash
    """
    if payment_method == "cash_on_delivery":
        return True

    if not payment_completed:
        return False

    if payment_method == "stripe":
        return bool(stripe_payment_id) and validate_stripe_payment(db, stripe_payment_id)

    if payment_method in ("eth", "matic"):
        return bool(tx_hash) and validate_crypto_payment(db, tx_hash, payment_method)

    return False


def build_mock_payment(payment_id: str) -> Dict[str, Any]:
    if payment_id.startswith("pi_") or payment_id.startswith("cs_"):
        return {
            "payment_id": payment_id,
            "network": "stripe",
            "status": "confirmed",
            "amount": 100.0,
            "currency": "USD",
        }
    return {
        "payment_id": payment_id,
        "network": "ethereum",
        "status": "confirmed",
        "amount": 0.02,
        "currency": "ETH",
    }


def record_payment(
    db,
    tx_hash: str,
    network: str,
    status: str = "confirmed",
    amount: float = 0.0,
    currency: str = "ETH",
    customer_id: str | None = None,
) -> Dict[str, Any]:
    """Record a crypto payment (ETH/Matic) for validation. Used by webhooks or testing."""
    net = "ethereum" if network.lower() in ("eth", "ethereum") else "matic"
    doc = {
        "tx_hash": tx_hash,
        "network": net,
        "status": status,
        "amount": amount,
        "currency": currency,
        "customer_id": customer_id,
    }
    try:
        db.payments.update_one(
            {"tx_hash": tx_hash},
            {"$set": doc},
            upsert=True,
        )
    except Exception:
        pass
    if customer_id:
        try:
            from services.customer_data_service import record_customer_item
            record_customer_item(db, customer_id, "payment", doc)
        except Exception:
            pass
    return doc


def record_stripe_payment(
    db, 
    stripe_payment_id: str, 
    status: str = "confirmed",
    amount: float = 0.0,
    currency: str = "USD",
    customer_id: str | None = None,
) -> Dict[str, Any]:
    """Record a Stripe payment for validation. Used by webhooks or testing."""
    doc = {
        "stripe_payment_id": stripe_payment_id, 
        "network": "stripe",
        "status": status,
        "amount": amount,
        "currency": currency,
        "customer_id": customer_id,
    }
    try:
        db.payments.update_one(
            {"stripe_payment_id": stripe_payment_id},
            {"$set": doc},
            upsert=True,
        )
    except Exception:
        pass
    if customer_id:
        try:
            from services.customer_data_service import record_customer_item
            record_customer_item(db, customer_id, "payment", doc)
        except Exception:
            pass
    return doc


def _append_query(url: str, params: Dict[str, Any]) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    for key, value in params.items():
        if value is not None and value != "":
            query[key] = str(value)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def create_stripe_checkout_session(cart: Dict[str, Any], viewer_role: str | None = None) -> Dict[str, Any]:
    """Create a Stripe Checkout Session for the cart."""
    stripe = _get_stripe_client()
    if not stripe:
        raise ValueError("Stripe is not configured")

    line_items = []
    for item in cart.get("items", []):
        name = str(item.get("name", "Item"))
        price = float(item.get("price", 0))
        currency = str(item.get("currency", "USD")).lower()
        quantity = int(item.get("quantity", 1))
        unit_amount = int(round(price * 100))
        line_items.append(
            {
                "price_data": {
                    "currency": currency,
                    "product_data": {"name": name},
                    "unit_amount": unit_amount,
                },
                "quantity": quantity,
            }
        )

    customer_id = cart.get("customer_id", "")
    success_url = _append_query(
        settings.stripe_success_url,
        {
            "customer_id": customer_id,
            "role": viewer_role or "",
            "session_id": "{CHECKOUT_SESSION_ID}",
        },
    )
    cancel_url = _append_query(
        settings.stripe_cancel_url,
        {
            "customer_id": customer_id,
            "role": viewer_role or "",
        },
    )

    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=line_items,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "cart_id": cart.get("cart_id", ""),
            "customer_id": customer_id,
            "viewer_role": viewer_role or "",
        },
    )

    return {
        "session_id": session.get("id") if isinstance(session, dict) else getattr(session, "id", ""),
        "checkout_url": session.get("url") if isinstance(session, dict) else getattr(session, "url", ""),
    }
