import numpy as np
import xgboost as xgb


# Simple baseline: train a regressor on a sliding window over history

def forecast_demand(history: list[float], window: int = 3) -> float:
    if len(history) < window + 1:
        return float(np.mean(history)) if history else 0.0

    X = []
    y = []
    for i in range(len(history) - window):
        X.append(history[i : i + window])
        y.append(history[i + window])

    X_arr = np.array(X)
    y_arr = np.array(y)

    model = xgb.XGBRegressor(
        n_estimators=50,
        max_depth=3,
        learning_rate=0.1,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="reg:squarederror",
        random_state=42,
    )
    model.fit(X_arr, y_arr)

    last_window = np.array([history[-window:]])
    pred = model.predict(last_window)[0]
    return float(pred)
