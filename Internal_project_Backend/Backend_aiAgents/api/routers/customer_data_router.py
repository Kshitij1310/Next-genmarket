from fastapi import APIRouter, Depends, HTTPException
from pymongo.database import Database

from core.db import get_db
from core.deps import get_current_user, require_admin
from services.customer_data_service import get_customer_record
from models.schemas import CartResponse, CartItemResponse, CartCreateRequest

router = APIRouter(prefix="/api", tags=["customer-data"])


def _authorize(customer_id: str, user: dict):
    if user.get("role") == "admin":
        return
    if user.get("customer_id") != customer_id:
        raise HTTPException(status_code=403, detail="Access denied")


def _effective_customer_id(customer_id: str, user: dict) -> str:
    """
    For write/checkout flows, admin should always operate on their own
    customer bucket from token, not arbitrary path customer_id.
    """
    if user.get("role") == "admin":
        return str(user.get("customer_id") or customer_id)
    return customer_id


@router.get("/{customer_id}/orders/{order_id}")
def get_customer_order(
    customer_id: str,
    order_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _authorize(customer_id, user)
    record = get_customer_record(db, customer_id, "order", "order_id", order_id)
    if not record:
        raise HTTPException(status_code=404, detail="Order not found")
    return record


@router.get("/{customer_id}/orders")
def list_customer_orders(
    customer_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _authorize(customer_id, user)
    try:
        records = list(
            db[customer_id].find({"_type": "order"}, {"_id": 0}).sort("created_at", -1)
        )
    except Exception:
        records = []
    return {"orders": records}


@router.get("/{customer_id}/shipments/{shipment_id}")
def get_customer_shipment(
    customer_id: str,
    shipment_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _authorize(customer_id, user)
    record = get_customer_record(db, customer_id, "shipment", "shipment_id", shipment_id)
    if not record:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return record


@router.get("/{customer_id}/cart")
def get_customer_cart(
    customer_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _authorize(customer_id, user)
    record = get_customer_record(db, customer_id, "cart", "payment_status", "pending")
    if not record:
        raise HTTPException(status_code=404, detail="Cart not found")
    return record


@router.post("/{customer_id}/cart", response_model=CartResponse)
def create_customer_cart(
    customer_id: str,
    req: CartCreateRequest,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> CartResponse:
    _authorize(customer_id, user)
    customer_id = _effective_customer_id(customer_id, user)
    items = [{"sku": i.sku, "quantity": i.quantity} for i in req.items]
    from services.cart_service import add_to_cart
    cart = add_to_cart(db, customer_id, items, req.payment_method)

    resp_items = [
        CartItemResponse(
            sku=it.get("sku", ""),
            quantity=int(it.get("quantity", 1)),
            name=it.get("name", ""),
            price=float(it.get("price", 0)),
            currency=it.get("currency", "USD"),
        )
        for it in cart.get("items", [])
    ]

    return CartResponse(
        cart_id=cart["cart_id"],
        customer_id=cart["customer_id"],
        items=resp_items,
        payment_method=cart.get("payment_method", ""),
        payment_status=cart.get("payment_status", "pending"),
    )


@router.post("/{customer_id}/cart/checkout")
def checkout_customer_cart(
    customer_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _authorize(customer_id, user)
    customer_id = _effective_customer_id(customer_id, user)
    cart = get_customer_record(db, customer_id, "cart", "payment_status", "pending")
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")

    payment_method = cart.get("payment_method", "stripe")
    items = [{"sku": it["sku"], "quantity": it["quantity"]} for it in cart.get("items", [])]

    if payment_method == "stripe":
        from services.payment_service import create_stripe_checkout_session
        session = create_stripe_checkout_session(cart, viewer_role=user.get("role"))
        return {
            "cart_id": cart.get("cart_id"),
            "status": "payment_pending",
            "checkout_url": session.get("checkout_url", ""),
            "session_id": session.get("session_id", ""),
        }

    return {"detail": "Only stripe checkout via per-customer cart is supported"}


@router.get("/{customer_id}/cart/payment-session")
def customer_cart_payment_session(
    customer_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _authorize(customer_id, user)
    customer_id = _effective_customer_id(customer_id, user)
    cart = get_customer_record(db, customer_id, "cart", "payment_status", "pending")
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    if cart.get("payment_method") != "stripe":
        raise HTTPException(status_code=400, detail="Cart is not set for Stripe payment")
    from services.payment_service import create_stripe_checkout_session
    session = create_stripe_checkout_session(cart, viewer_role=user.get("role"))
    return {
        "cart_id": cart.get("cart_id"),
        "session_id": session.get("session_id", ""),
        "checkout_url": session.get("checkout_url", ""),
    }


@router.get("/{customer_id}/payments/{payment_id}")
def get_customer_payment(
    customer_id: str,
    payment_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _authorize(customer_id, user)
    record = get_customer_record(db, customer_id, "payment", "stripe_payment_id", payment_id)
    if not record:
        # try tx_hash
        record = get_customer_record(db, customer_id, "payment", "tx_hash", payment_id)
    if not record:
        raise HTTPException(status_code=404, detail="Payment not found")
    return record
