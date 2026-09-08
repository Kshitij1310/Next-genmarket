from fastapi import APIRouter, Request, HTTPException
from pymongo.database import Database

from core.db import get_db
from core.config import settings
from services.webhook_service import handle_stripe_event

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.post("/stripe")
async def stripe_webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing Stripe signature")

    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=500, detail="Stripe webhook secret not configured")

    db: Database = get_db()
    handled = handle_stripe_event(db, payload, signature, settings.stripe_webhook_secret)
    if not handled:
        raise HTTPException(status_code=400, detail="Invalid Stripe event")

    return {"status": "ok"}
