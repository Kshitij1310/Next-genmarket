from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List

from agents.base import BaseAgent
from models.agent import AgentResponse


@dataclass
class InventoryThreshold:
    sku: str
    min_qty: int


class InventoryAgent(BaseAgent):
    """Agent responsible for inventory monitoring and reorder signaling."""

    def __init__(self, name: str = "inventory") -> None:
        super().__init__(name=name)

    def execute(self, **kwargs: Any) -> AgentResponse:
        """Run a full inventory check cycle.

        Expected kwargs:
        - thresholds: list[InventoryThreshold] or list[dict]
        """
        thresholds = kwargs.get("thresholds", [])
        normalized = [
            t if isinstance(t, InventoryThreshold) else InventoryThreshold(**t)
            for t in thresholds
        ]

        low = self.check_stock(normalized)
        for item in low:
            self.trigger_reorder(item["sku"], item["qty"], item["min_qty"])

        return self.respond_ok({"low_inventory": low, "checked": len(normalized)})

    def check_stock(self, thresholds: List[InventoryThreshold]) -> List[Dict[str, Any]]:
        """Return list of low-inventory items with current qty and min threshold."""
        low: List[Dict[str, Any]] = []
        inventory = self.db.inventory

        for t in thresholds:
            doc = inventory.find_one({"sku": t.sku}) or {"sku": t.sku, "qty": 0}
            qty = int(doc.get("qty", 0))
            if qty < t.min_qty:
                low.append({"sku": t.sku, "qty": qty, "min_qty": t.min_qty})

        return low

    def trigger_reorder(self, sku: str, qty: int, min_qty: int) -> None:
        """Insert a reorder event for downstream processors."""
        event = {
            "sku": sku,
            "qty": qty,
            "min_qty": min_qty,
            "status": "pending",
            "created_at": datetime.now(timezone.utc),
            "source": self.name,
        }

        self.db.reorder_events.insert_one(event)
        self.log_event(
            event="reorder_triggered",
            message=f"Reorder triggered for {sku}",
            sku=sku,
            qty=qty,
            min_qty=min_qty,
        )

    def update_inventory(self, sku: str, qty: int, metadata: Dict[str, Any] | None = None) -> None:
        """Upsert inventory quantity and metadata."""
        payload = {
            "sku": sku,
            "qty": qty,
            "updated_at": datetime.now(timezone.utc),
        }
        if metadata:
            payload["metadata"] = metadata

        self.db.inventory.update_one({"sku": sku}, {"$set": payload}, upsert=True)
        self.log_event("inventory_updated", sku=sku, qty=qty)
