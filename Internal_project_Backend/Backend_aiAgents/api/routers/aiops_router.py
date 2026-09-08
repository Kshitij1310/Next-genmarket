from fastapi import APIRouter, Depends
from pymongo.database import Database

from core.db import get_db
from core.deps import require_admin
from models.schemas import AIOpsForecastResponse
from services.aiops_service import forecast_demand

router = APIRouter(prefix="/api/aiops", tags=["aiops"])


@router.get("/forecast/{sku}", response_model=AIOpsForecastResponse)
def forecast(
    sku: str,
    db: Database = Depends(get_db),
    _admin: dict = Depends(require_admin),
) -> AIOpsForecastResponse:
    result = forecast_demand(db, sku)
    return AIOpsForecastResponse(**result)
