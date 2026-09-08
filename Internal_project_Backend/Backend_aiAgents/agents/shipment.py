from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from agents.base import BaseAgent
from models.agent import AgentResponse


@dataclass
class ShipmentUpdate:
    shipment_id: str
    status: str
    location: str
    updated_at: datetime
    expected_at: datetime | None = None


class ShipmentAgent(BaseAgent):
    """Agent responsible for shipment monitoring and delay alerts."""

    def __init__(self, name: str = "shipment") -> None:
        super().__init__(name=name)

    def execute(self, **kwargs: Any) -> AgentResponse:
        """Process a shipment update payload.

        Expected kwargs:
        - update: ShipmentUpdate or dict
        """
        update = kwargs.get("update")
        if update is None:
            return self.respond_error("Missing shipment update")

        payload = update if isinstance(update, ShipmentUpdate) else ShipmentUpdate(**update)

        eta = self.predict_eta(payload)
        delayed = self.detect_delay(payload, eta)
        self.store_update(payload, eta, delayed)

        if delayed:
            self.trigger_alert(payload.shipment_id, payload.location, eta)

        return self.respond_ok({"shipment_id": payload.shipment_id, "eta": eta.isoformat(), "delayed": delayed})

    def predict_eta(self, update: ShipmentUpdate) -> datetime:
        """Placeholder ETA prediction logic (add ML/telemetry later)."""
        if update.expected_at:
            return update.expected_at
        # Simple heuristic: 24 hours from last update
        return update.updated_at + timedelta(hours=24)

    def detect_delay(self, update: ShipmentUpdate, eta: datetime) -> bool:
        """Detect delays by comparing ETA to expected time, if provided."""
        if update.expected_at is None:
            return False
        return eta > update.expected_at

    def trigger_alert(self, shipment_id: str, location: str, eta: datetime) -> None:
        """Insert a delay alert event for downstream processors (e.g., WebSocket)."""
        event = {
            "shipment_id": shipment_id,
            "location": location,
            "eta": eta,
            "type": "delay",
            "status": "open",
            "created_at": datetime.now(timezone.utc),
            "source": self.name,
        }

        self.db.alert_events.insert_one(event)
        self.log_event(
            event="shipment_delay",
            message=f"Delay detected for shipment {shipment_id}",
            shipment_id=shipment_id,
            location=location,
            eta=eta.isoformat(),
        )

    def store_update(self, update: ShipmentUpdate, eta: datetime, delayed: bool) -> None:
        """Persist shipment updates for tracking and analytics."""
        payload = {
            "shipment_id": update.shipment_id,
            "status": update.status,
            "location": update.location,
            "updated_at": update.updated_at,
            "expected_at": update.expected_at,
            "eta": eta,
            "delayed": delayed,
            "source": self.name,
        }

        self.db.shipments.update_one(
            {"shipment_id": update.shipment_id},
            {"$set": payload},
            upsert=True,
        )

        # Event-ready hook for future WebSocket integration
        # Example: enqueue or publish payload to a message bus
        self.log_event("shipment_updated", shipment_id=update.shipment_id, status=update.status)
