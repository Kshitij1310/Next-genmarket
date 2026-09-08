from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.database import Database

from core.db import get_db
from core.deps import get_current_user, require_admin
from models.schemas import PaymentStatusResponse, PaymentRecordRequest, StripePaymentRecordRequest
from services.payment_service import (
    get_payment_status,
    get_stripe_payment,
    build_mock_payment,
    record_payment,
    record_stripe_payment,
)

router = APIRouter(prefix="/api/payment", tags=["payment"])


@router.post("/crypto", response_model=PaymentStatusResponse)
def record_crypto_payment(
    req: PaymentRecordRequest,
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> PaymentStatusResponse:
    """Record ETH/Matic payment for testing or webhook. Use this before creating order with tx_hash."""
    doc = record_payment(db, req.tx_hash, req.network, req.status, req.amount, req.currency, req.customer_id)
    return PaymentStatusResponse(
        payment_id=doc["tx_hash"],
        network=doc["network"],
        status=doc["status"],
        amount=doc["amount"],
        currency=doc["currency"]
    )


@router.post("/stripe")
def record_stripe(
    req: StripePaymentRecordRequest,
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Record Stripe payment for testing or webhook. Use before creating order with stripe_payment_id."""
    return record_stripe_payment(db, req.stripe_payment_id, req.status, req.amount, req.currency, req.customer_id)


@router.post("")
def record_stripe_root(
    req: StripePaymentRecordRequest,
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """Record Stripe payment for testing or webhook (alias)."""
    return record_stripe_payment(db, req.stripe_payment_id, req.status, req.amount, req.currency, req.customer_id)


@router.get("", response_model=List[PaymentStatusResponse])
def list_all_payments(
    limit: int = Query(100, ge=1, le=500),
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> List[PaymentStatusResponse]:
    """Admin-only: list all payments (Stripe + crypto)."""
    rows = list(db.payments.find({}, {"_id": 0}).sort("updated_at", -1).limit(limit))
    result: List[PaymentStatusResponse] = []
    for payment in rows:
        payment_id = (
            payment.get("stripe_payment_id")
            or payment.get("tx_hash")
            or payment.get("payment_id")
            or "unknown"
        )
        result.append(
            PaymentStatusResponse(
                payment_id=payment_id,
                network=payment.get("network", "unknown"),
                status=payment.get("status", "unknown"),
                amount=float(payment.get("amount", payment.get("amount_eth", 0.0)) or 0.0),
                currency=payment.get("currency", "USD"),
            )
        )
    return result


@router.get("/{payment_id}", response_model=PaymentStatusResponse)
def payment_status(
    payment_id: str,
    db: Database = Depends(get_db),
    _user: dict = Depends(get_current_user),
) -> PaymentStatusResponse:
    user = _user
    if payment_id.startswith("pi_") or payment_id.startswith("cs_"):
        payment = get_stripe_payment(db, payment_id)
        if not payment:
            payment = build_mock_payment(payment_id)
        if user.get("role") == "user" and payment.get("customer_id") and payment.get("customer_id") != user.get("customer_id"):
            raise HTTPException(status_code=403, detail="Access denied")
        return PaymentStatusResponse(
            payment_id=payment.get("stripe_payment_id", payment.get("payment_id", payment_id)),
            network="stripe",
            status=payment.get("status", "unknown"),
            amount=payment.get("amount", payment.get("amount_eth", 0.0)),
            currency=payment.get("currency", "USD"),
        )
    
    payment = get_payment_status(db, payment_id)
    if not payment:
        payment = build_mock_payment(payment_id)
    if user.get("role") == "user" and payment.get("customer_id") and payment.get("customer_id") != user.get("customer_id"):
        raise HTTPException(status_code=403, detail="Access denied")
    return PaymentStatusResponse(
        payment_id=payment.get("tx_hash", payment.get("payment_id", payment_id)),
        network=payment.get("network", "ethereum"),
        status=payment.get("status", "unknown"),
        amount=payment.get("amount", payment.get("amount_eth", 0.0)),
        currency=payment.get("currency", "ETH")
    )


@router.get("/stripe/{stripe_payment_id}", response_model=PaymentStatusResponse)
def stripe_payment_status(
    stripe_payment_id: str,
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> PaymentStatusResponse:
    payment = get_stripe_payment(db, stripe_payment_id)
    if not payment:
        return PaymentStatusResponse(
            payment_id=stripe_payment_id,
            network="stripe",
            status="not_found",
            amount=0.0,
            currency="USD"
        )
    return PaymentStatusResponse(
        payment_id=payment.get("stripe_payment_id", stripe_payment_id),
        network="stripe",
        status=payment.get("status", "unknown"),
        amount=payment.get("amount", 0.0),
        currency=payment.get("currency", "USD")
    )
