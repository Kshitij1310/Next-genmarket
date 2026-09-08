from __future__ import annotations

import threading
import time
import logging

from core.config import settings
from core.db import get_db
from services.reorder_service import run_reorder_cycle, process_pending_reorders

logger = logging.getLogger(__name__)

_thread: threading.Thread | None = None


def _loop() -> None:
    interval = max(1, settings.reorder_interval_minutes) * 60
    logger.info("Reorder scheduler started, interval=%ss", interval)
    while True:
        try:
            db = get_db()
            run_reorder_cycle(db)
            process_pending_reorders(db)
        except Exception as exc:
            logger.exception("Reorder scheduler error: %s", exc)
        time.sleep(interval)


def start_reorder_scheduler() -> None:
    global _thread
    if not settings.reorder_enabled:
        return
    if _thread and _thread.is_alive():
        return
    _thread = threading.Thread(target=_loop, daemon=True)
    _thread.start()
