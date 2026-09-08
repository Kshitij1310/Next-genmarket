from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List

import numpy as np
import xgboost as xgb

from agents.base import BaseAgent
from models.agent import AgentResponse


@dataclass
class DemandRequest:
    sku: str
    history: List[float]


class AIOpsAgent(BaseAgent):
    """Agent for SKU-level demand forecasting and logistics suggestions."""

    _model: xgb.XGBRegressor | None = None

    def __init__(self, name: str = "aiops", model_path: str | None = None) -> None:
        super().__init__(name=name)
        self.model_path = model_path

    def execute(self, **kwargs: Any) -> AgentResponse:
        req = kwargs.get("request")
        if not req:
            return self.respond_error("Missing demand request")

        payload = req if isinstance(req, DemandRequest) else DemandRequest(**req)

        model = self._load_model()
        prediction = self.predict_demand(model, payload.history)
        warehouse = self.select_warehouse(payload.sku, prediction)
        route = self.suggest_route(payload.sku, warehouse)

        result = {
            "sku": payload.sku,
            "prediction": prediction,
            "warehouse": warehouse,
            "route": route,
        }

        self.log_prediction(result)
        return self.respond_ok(result)

    def _load_model(self) -> xgb.XGBRegressor:
        """Load model once per process for efficiency."""
        if AIOpsAgent._model is not None:
            return AIOpsAgent._model

        model = xgb.XGBRegressor(
            n_estimators=50,
            max_depth=3,
            learning_rate=0.1,
            subsample=0.9,
            colsample_bytree=0.9,
            objective="reg:squarederror",
            random_state=42,
        )

        if self.model_path:
            model.load_model(self.model_path)

        AIOpsAgent._model = model
        return model

    def predict_demand(self, model: xgb.XGBRegressor, history: List[float], window: int = 3) -> float:
        if len(history) < window:
            return float(np.mean(history)) if history else 0.0

        X = np.array([history[-window:]])
        pred = model.predict(X)[0]
        return float(pred)

    def select_warehouse(self, sku: str, prediction: float) -> str:
        """Mock warehouse selection logic."""
        # Placeholder: route based on prediction volume
        return "WH-1" if prediction < 100 else "WH-2"

    def suggest_route(self, sku: str, warehouse: str) -> str:
        """Mock route suggestion logic."""
        return f"{warehouse} -> Regional Hub -> Customer"

    def log_prediction(self, result: Dict[str, Any]) -> None:
        payload = {
            **result,
            "created_at": datetime.now(timezone.utc),
            "source": self.name,
        }
        self.db.aiops_predictions.insert_one(payload)
        self.log_event("aiops_prediction", sku=result["sku"], prediction=result["prediction"])
