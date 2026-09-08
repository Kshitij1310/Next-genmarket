from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pymongo.database import Database

from core.db import get_db
from core.deps import get_current_user
from models.schemas import ShipmentTrackingResponse
from services.tracking_service import get_tracking, build_tracking_response
from services.inventory_service import recalculate_warehouse_utilization
from services.inventory_expiry_service import consume_inventory_fefo
from services.notification_service import notify_admin, notify_user

router = APIRouter(prefix="/api/tracking", tags=["tracking"])


@router.get("/{shipment_id}", response_model=ShipmentTrackingResponse)
def track(
    shipment_id: str,
    db: Database = Depends(get_db),
    _user: dict = Depends(get_current_user),
) -> ShipmentTrackingResponse:
    shipment = get_tracking(db, shipment_id)
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    payload = build_tracking_response(shipment)
    return ShipmentTrackingResponse(**payload)


@router.post("/deliver/{shipment_id}")
def mark_delivered(
    shipment_id: str,
    db: Database = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    shipment = db.shipments.find_one({"shipment_id": shipment_id})
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    order = db.orders.find_one({"shipment_id": shipment_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found for shipment")

    items = order.get("items", [])
    wh = shipment.get("warehouse_code")
    consumed = []
    for it in items:
        sku = it.get("sku")
        qty = int(it.get("quantity", 0))
        if not sku or not wh:
            continue
        consumed.append(
            {
                "sku": sku,
                **consume_inventory_fefo(db, wh, sku, qty),
            }
        )

    db.shipments.update_one(
        {"shipment_id": shipment_id},
        {"$set": {"status": "delivered", "delivered_at": datetime.now(timezone.utc)}},
    )

    utilization = recalculate_warehouse_utilization(db, wh) if wh else None

    customer_id = order.get("customer_id")
    order_id = order.get("order_id", "")
    if customer_id:
        notify_user(
            db,
            customer_id,
            "Order delivered",
            f"Order {order_id} has been delivered. Shipment {shipment_id} is complete.",
            link=f"/tracking?shipment_id={shipment_id}",
            type="order_status",
        )
    notify_admin(
        db,
        "Shipment delivered",
        f"{shipment_id} ({order_id}) delivered from warehouse {wh}.",
        link=f"/admin/tracking?shipment_id={shipment_id}",
        type="order_status",
    )

    return {
        "status": "delivered",
        "shipment_id": shipment_id,
        "consumed": consumed,
        "warehouse_utilization": utilization,
    }
