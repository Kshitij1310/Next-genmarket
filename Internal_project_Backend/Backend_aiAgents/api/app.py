from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from api.routers.product_router import router as product_router
from api.routers.inventory_router import router as inventory_router
from api.routers.cart_router import router as cart_router
from api.routers.order_router import router as order_router
from api.routers.tracking_router import router as tracking_router
from api.routers.chat_router import router as chat_router
from api.routers.payment_router import router as payment_router
from api.routers.aiops_router import router as aiops_router
from api.routers.reorder_router import router as reorder_router
from api.routers.auth_router import router as auth_router
from api.routers.webhook_router import router as webhook_router
from api.routers.customer_data_router import router as customer_data_router
from api.routers.profile_router import router as profile_router
from api.routers.notification_router import router as notification_router
from api.routers.notification_router import ws_router as notification_ws_router
import asyncio

from core.logging import configure_logging
from core.ws_hub import hub
from core.reorder_scheduler import start_reorder_scheduler


def create_app() -> FastAPI:
    configure_logging()

    app = FastAPI(title="Supply Chain POC")
    images_dir = Path(__file__).resolve().parent.parent / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.mount("/images", StaticFiles(directory=str(images_dir)), name="images")
    app.include_router(product_router)
    app.include_router(inventory_router)
    app.include_router(cart_router)
    app.include_router(order_router)
    app.include_router(tracking_router)
    app.include_router(chat_router)
    app.include_router(payment_router)
    app.include_router(aiops_router)
    app.include_router(reorder_router)
    app.include_router(auth_router)
    app.include_router(webhook_router)
    app.include_router(customer_data_router)
    app.include_router(profile_router)
    app.include_router(notification_router)
    app.include_router(notification_ws_router)

    @app.on_event("startup")
    async def _bind_ws_loop() -> None:
        # Sync service code publishes notifications through this loop.
        hub.bind_loop(asyncio.get_running_loop())


    start_reorder_scheduler()
    return app
