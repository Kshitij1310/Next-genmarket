"""Cart API: view cart, checkout from cart when payment complete."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.database import Database

from core.db import get_db
from core.deps import get_current_user
from models.schemas import (
    CartResponse,
    CartItemResponse,
    CartCheckoutRequest,
    OrderCreateResponse,
    CartPaymentSessionResponse,
    CartCreateRequest,
)
from services.cart_service import get_cart, get_carts_by_customer, add_to_cart
from services.order_service import create_order
from services.payment_service import create_stripe_checkout_session

router = APIRouter(prefix="/api/cart", tags=["cart"])


@router.get("/{cart_id}", response_model=CartResponse)
def get_cart_by_id(
    cart_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> CartResponse:
    raise HTTPException(status_code=410, detail="Cart is stored per-customer. Use /api/{customer_id}/cart")
    if user.get("role") == "user" and cart.get("customer_id") != user.get("customer_id"):
        raise HTTPException(status_code=403, detail="Access denied")
    items = [
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
        items=items,
        payment_method=cart.get("payment_method", ""),
        payment_status=cart.get("payment_status", "pending"),
    )


@router.post("", response_model=CartResponse)
def create_cart(
    req: CartCreateRequest,
    db: Database = Depends(get_db),
    _user: dict = Depends(get_current_user),
) -> CartResponse:
    """Deprecated: use POST /api/{customer_id}/cart instead."""
    raise HTTPException(status_code=410, detail="Use POST /api/{customer_id}/cart")


@router.get("", response_model=List[CartResponse])
def list_carts(
    customer_id: str = Query(..., description="Filter by customer"),
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> List[CartResponse]:
    if user.get("role") == "user" and customer_id != user.get("customer_id"):
        raise HTTPException(status_code=403, detail="Access denied")
    carts = get_carts_by_customer(db, customer_id)
    result = []
    for cart in carts:
        items = [
            CartItemResponse(
                sku=it.get("sku", ""),
                quantity=int(it.get("quantity", 1)),
                name=it.get("name", ""),
                price=float(it.get("price", 0)),
                currency=it.get("currency", "USD"),
            )
            for it in cart.get("items", [])
        ]
        result.append(
            CartResponse(
                cart_id=cart["cart_id"],
                customer_id=cart["customer_id"],
                items=items,
                payment_method=cart.get("payment_method", ""),
                payment_status=cart.get("payment_status", "pending"),
            )
        )
    return result


@router.post("/{cart_id}/checkout", response_model=OrderCreateResponse)
def checkout_cart(
    cart_id: str,
    req: CartCheckoutRequest,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> OrderCreateResponse:
    """Complete payment for a cart and create order + shipment."""
    # cart_id lookup not supported; use per-customer cart endpoint
    raise HTTPException(status_code=410, detail="Use /api/{customer_id}/cart/checkout")
    if user.get("role") == "user" and cart.get("customer_id") != user.get("customer_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    payment_method = cart.get("payment_method", "stripe")
    items = [{"sku": it["sku"], "quantity": it["quantity"]} for it in cart.get("items", [])]

    if payment_method in ("eth", "matic"):
        if not req.tx_hash:
            raise HTTPException(status_code=400, detail="tx_hash required for crypto payment")
        result = create_order(
            db, items, cart["customer_id"],
            payment_method=payment_method,
            payment_completed=True,
            tx_hash=req.tx_hash,
        )
    elif payment_method == "stripe":
        if not req.stripe_payment_id:
            session = create_stripe_checkout_session(cart)
            return OrderCreateResponse(
                order_id=None,
                cart_id=cart_id,
                status="payment_pending",
                allocated_warehouse=None,
                shipment_id=None,
                message="Complete payment to place order.",
                checkout_url=session.get("checkout_url", ""),
            )
        result = create_order(
            db, items, cart["customer_id"],
            payment_method=payment_method,
            payment_completed=True,
            stripe_payment_id=req.stripe_payment_id,
        )
    else:
        raise HTTPException(status_code=400, detail="Use cash_on_delivery for COD - create order directly")

    if result.get("cart_id"):
        raise HTTPException(
            status_code=400,
            detail="Payment validation failed. Ensure tx_hash or stripe_payment_id is valid.",
        )

    return OrderCreateResponse(
        order_id=result.get("order_id"),
        cart_id=None,
        status=result["status"],
        allocated_warehouse=result.get("allocated_warehouse"),
        shipment_id=result.get("shipment_id"),
        message=result.get("message", ""),
        checkout_url=None,
    )


@router.get("/{cart_id}/payment-session", response_model=CartPaymentSessionResponse)
def payment_session(
    cart_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> CartPaymentSessionResponse:
    """Create a Stripe Checkout Session for a cart."""
    raise HTTPException(status_code=410, detail="Use /api/{customer_id}/cart/payment-session")
