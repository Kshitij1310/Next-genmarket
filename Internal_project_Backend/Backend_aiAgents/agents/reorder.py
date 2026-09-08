"""Reorder agent: monitors warehouse inventory and triggers supply orders when below threshold."""

from __future__ import annotations

from typing import Any, Dict

from agents.base import BaseAgent
from models.agent import AgentResponse
from services.reorder_service import run_reorder_cycle


class ReorderAgent(BaseAgent):
    """Agent that checks warehouse stock vs thresholds, predicts demand, and places supply orders."""

    def __init__(self, name: str = "reorder") -> None:
        super().__init__(name=name)

    def execute(self, **kwargs: Any) -> AgentResponse:
        """Run a full reorder cycle: check low stock, predict demand, contact dealers."""
        try:
            db = self.db
            result = run_reorder_cycle(db)

            self.log_event(
                event="reorder_cycle_completed",
                message=f"Low stock: {result['low_stock_count']}, Orders created: {result['orders_created']}",
                low_stock_count=result["low_stock_count"],
                orders_created=result["orders_created"],
            )

            return self.respond_ok(
                data=result,
                low_stock_count=result["low_stock_count"],
                orders_created=result["orders_created"],
            )
        except Exception as e:
            self.log_event("reorder_cycle_failed", level="ERROR", message=str(e))
            return self.respond_error(str(e))
