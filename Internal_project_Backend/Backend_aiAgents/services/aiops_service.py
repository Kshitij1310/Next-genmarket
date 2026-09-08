from __future__ import annotations

from typing import Dict, Any


def forecast_demand(db, sku: str) -> Dict[str, Any]:
    """Get demand forecast from aiops_predictions collection or generate fallback."""
    try:
        # Try to get latest prediction from MongoDB
        prediction = db.aiops_predictions.find_one(
            {"sku": sku},
            {"_id": 0},
            sort=[("created_at", -1)]  # Get most recent
        )
        
        if prediction:
            return {
                "sku": sku,
                "predicted_demand": float(prediction.get("prediction", 0)),
                "recommended_warehouse": prediction.get("warehouse", "WH-N"),
                "route": prediction.get("route", ""),
                "confidence": 0.85,  # Default confidence for stored predictions
            }
    except Exception:
        pass
    
    # Fallback: generate mock prediction if no data found
    base = sum(ord(c) for c in sku) % 300
    predicted = 150 + base
    confidence = round(0.75 + (base % 20) / 100, 2)

    return {
        "sku": sku,
        "predicted_demand": predicted,
        "recommended_warehouse": "WH-NE" if predicted >= 250 else "WH-N",
        "confidence": confidence,
    }
