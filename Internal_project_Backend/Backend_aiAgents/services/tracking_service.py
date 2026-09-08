from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Any


def get_tracking(db, shipment_id: str) -> Dict[str, Any] | None:
    try:
        shipment = db.shipments.find_one({"shipment_id": shipment_id}, {"_id": 0})
        if shipment:
            return shipment
    except Exception:
        pass

    return None


def build_tracking_response(shipment: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "shipment_id": shipment.get("shipment_id"),
        "status": shipment.get("status", "In Transit"),
        "location": shipment.get("location", "Unknown Hub"),
        "eta": shipment.get("eta", datetime.now(timezone.utc)),
        "map_enabled": False,
        "message": "Live map tracking currently unavailable",
    }
