"""Reorder API: run reorder agent, list AI supply orders."""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from pymongo.database import Database

from core.db import get_db
from core.deps import require_admin
from models.schemas import ReorderRunResponse
from services.reorder_service import (
    run_reorder_cycle,
    get_low_stock_items,
    process_pending_reorders,
    process_dealer_response,
    validate_inventory_thresholds,
)
from agents.reorder import ReorderAgent

router = APIRouter(prefix="/api/reorder", tags=["reorder"])


@router.post("/run", response_model=ReorderRunResponse)
def run_reorder(db: Database = Depends(get_db), _admin: dict = Depends(require_admin)) -> ReorderRunResponse:
    """Run reorder cycle: check low stock, predict demand, contact dealers, store AI orders."""
    result = run_reorder_cycle(db)
    return ReorderRunResponse(
        low_stock_count=result["low_stock_count"],
        orders_created=result["orders_created"],
        orders=result["orders"],
    )


@router.get("/low-stock")
def low_stock(db: Database = Depends(get_db), _admin: dict = Depends(require_admin)):
    """List items below their minimum threshold (for monitoring)."""
    return get_low_stock_items(db)


@router.get("/ai-orders")
def list_ai_orders(
    limit: int = Query(500, ge=1, le=5000),
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """List AI supply orders from ai_supply_orders collection."""
    orders = list(
        db.ai_supply_orders.find({}, {"_id": 0}).sort("created_at", -1).limit(limit)
    )
    for o in orders:
        if "created_at" in o and hasattr(o["created_at"], "isoformat"):
            o["created_at"] = o["created_at"].isoformat()
    return orders


@router.get("/alerts")
def list_alerts(
    level: str | None = Query(None, description="Filter by level, e.g. info|warning|error"),
    limit: int = Query(200, ge=1, le=5000),
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    """List reorder-related alerts."""
    query: dict = {"source": "reorder_agent"}
    if level:
        query["level"] = level

    alerts = list(
        db.alert_events.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
    )
    for a in alerts:
        if "created_at" in a and hasattr(a["created_at"], "isoformat"):
            a["created_at"] = a["created_at"].isoformat()
    return {"count": len(alerts), "items": alerts}


@router.get("/threshold-violations")
def threshold_violations(db: Database = Depends(get_db), _admin: dict = Depends(require_admin)):
    """Validate inventory_thresholds against category limits."""
    return validate_inventory_thresholds(db)


@router.post("/process")
def process_pending(db: Database = Depends(get_db), _admin: dict = Depends(require_admin)):
    """Process pending reorders for dealer fallback."""
    return process_pending_reorders(db)


@router.get("/dealer/respond", response_class=HTMLResponse)
def dealer_respond(
    order_id: str = Query(...),
    dealer_priority: int = Query(..., ge=1, le=2),
    action: str = Query(..., pattern="^(approve|reject)$"),
    token: str = Query(...),
    db: Database = Depends(get_db),
):
    """
    Public dealer action endpoint used by email Approve/Reject links.
    No auth: secured by signed token.
    """
    result = process_dealer_response(db, order_id, dealer_priority, action, token)
    if not result.get("ok"):
        return HTMLResponse(
            status_code=400,
            content=f"<h3>Reorder action failed</h3><p>{result.get('message','Invalid request')}</p>",
        )
    return HTMLResponse(
        status_code=200,
        content=f"<h3>Response recorded</h3><p>{result.get('message')}</p><p>Status: {result.get('status')}</p>",
    )
