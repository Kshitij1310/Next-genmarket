"""In-process WebSocket fan-out for live notifications.

Connections are grouped into channels: ``admin`` for the operations console and
``user:<customer_id>`` for a single customer. Notifications are produced by
ordinary sync service code (running in FastAPI's threadpool), so publishing
hops back onto the event loop via ``call_soon_threadsafe``.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)

ADMIN_CHANNEL = "admin"


def user_channel(customer_id: str) -> str:
    return f"user:{customer_id}"


class WebSocketHub:
    def __init__(self) -> None:
        self._channels: Dict[str, Set[WebSocket]] = {}
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Remember the serving loop so sync code can publish into it."""
        self._loop = loop

    async def connect(self, channel: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._channels.setdefault(channel, set()).add(websocket)

    def disconnect(self, channel: str, websocket: WebSocket) -> None:
        sockets = self._channels.get(channel)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            self._channels.pop(channel, None)

    async def broadcast(self, channel: str, payload: Dict[str, Any]) -> None:
        sockets = list(self._channels.get(channel, ()))
        dead: List[WebSocket] = []
        for socket in sockets:
            try:
                await socket.send_json(payload)
            except Exception:
                dead.append(socket)
        for socket in dead:
            self.disconnect(channel, socket)

    def publish(self, channel: str, payload: Dict[str, Any]) -> None:
        """Fire-and-forget broadcast that is safe to call from sync code."""
        if not self._channels.get(channel):
            return

        loop = self._loop
        if loop is None or loop.is_closed():
            logger.debug("WS hub has no bound loop; dropping %s", channel)
            return

        try:
            loop.call_soon_threadsafe(
                lambda: asyncio.ensure_future(self.broadcast(channel, payload))
            )
        except RuntimeError:
            logger.debug("WS hub loop unavailable; dropping %s", channel)


hub = WebSocketHub()
