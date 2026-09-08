from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Dict

from core.db import get_db
from models.agent import AgentEvent, AgentResponse


class BaseAgent(ABC):
    def __init__(self, name: str) -> None:
        self.name = name
        self._logger = logging.getLogger(f"agents.{name}")

    @property
    def db(self):
        return get_db()

    @abstractmethod
    def execute(self, **kwargs: Any) -> AgentResponse:
        raise NotImplementedError

    def log_event(self, event: str, level: str = "INFO", message: str | None = None, **data: Any) -> None:
        entry = AgentEvent(agent=self.name, event=event, level=level, message=message, data=data)
        self._logger.log(getattr(logging, level, logging.INFO), f"{event} - {message or ''}")

        try:
            self.db.agent_events.insert_one(entry.model_dump())
        except Exception:  # Avoid agent failure due to logging
            self._logger.exception("Failed to persist agent event")

    def respond_ok(self, data: Dict[str, Any] | None = None, **meta: Any) -> AgentResponse:
        return AgentResponse.success(self.name, data=data, meta=meta)

    def respond_error(self, error: str, **meta: Any) -> AgentResponse:
        return AgentResponse.failure(self.name, error=error, meta=meta)

    def now_utc(self) -> datetime:
        return datetime.now(timezone.utc)
