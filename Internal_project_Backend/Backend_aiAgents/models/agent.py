from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class AgentEvent(BaseModel):
    agent: str
    event: str
    level: str = "INFO"
    message: Optional[str] = None
    data: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AgentResponse(BaseModel):
    agent: str
    ok: bool
    data: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def success(cls, agent: str, data: Optional[Dict[str, Any]] = None, meta: Optional[Dict[str, Any]] = None) -> "AgentResponse":
        return cls(agent=agent, ok=True, data=data or {}, meta=meta or {})

    @classmethod
    def failure(cls, agent: str, error: str, meta: Optional[Dict[str, Any]] = None) -> "AgentResponse":
        return cls(agent=agent, ok=False, error=error, meta=meta or {})
