from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict

from agents.base import BaseAgent
from core.config import settings
from models.agent import AgentResponse


@dataclass
class PaymentRequest:
    tx_hash: str
    network: str  # "eth" or "matic"
    from_address: str | None = None
    to_address: str | None = None
    amount_wei: int | None = None


class PaymentAgent(BaseAgent):
    """Agent for payment validation and status confirmation (mocked)."""

    def __init__(self, name: str = "payment") -> None:
        super().__init__(name=name)

    def execute(self, **kwargs: Any) -> AgentResponse:
        if not settings.blockchain_enabled:
            return self.respond_error("Blockchain payments are disabled")

        req = kwargs.get("request")
        if not req:
            return self.respond_error("Missing payment request")

        payload = req if isinstance(req, PaymentRequest) else PaymentRequest(**req)

        is_valid = self.validate_transaction(payload)
        status = self.confirm_status(payload, is_valid)

        record = self.store_transaction(payload, status, is_valid)
        return self.respond_ok({"transaction": record})

    def validate_transaction(self, req: PaymentRequest) -> bool:
        """Mock validation logic for ETH/Matic transactions."""
        if req.network.lower() not in {"eth", "matic"}:
            return False
        # Basic placeholder check
        return req.tx_hash.startswith("0x") and len(req.tx_hash) >= 10

    def confirm_status(self, req: PaymentRequest, is_valid: bool) -> str:
        """Mock status confirmation."""
        if not is_valid:
            return "invalid"
        return "confirmed"

    def store_transaction(self, req: PaymentRequest, status: str, is_valid: bool) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "tx_hash": req.tx_hash,
            "network": req.network.lower(),
            "from_address": req.from_address,
            "to_address": req.to_address,
            "amount_wei": req.amount_wei,
            "status": status,
            "is_valid": is_valid,
            "created_at": datetime.now(timezone.utc),
            "source": self.name,
        }

        self.db.payments.update_one({"tx_hash": req.tx_hash}, {"$set": payload}, upsert=True)
        self.log_event("payment_processed", tx_hash=req.tx_hash, status=status, network=req.network)
        return payload
