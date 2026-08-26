"""
Landslide risk model wrapper.

For the hackathon, this ships as a deterministic placeholder so the API
contract is stable while the real model is trained. Swap `_predict_placeholder`
for a loaded XGBoost model (see the commented block below) without touching
main.py — the public `predict_risk()` signature stays the same.
"""

import logging

logger = logging.getLogger("landslide.model")

MODEL_VERSION = "placeholder-v0.1"

# ---------------------------------------------------------------------------
# Real model wiring (uncomment once you have a trained model artifact)
# ---------------------------------------------------------------------------
# import xgboost as xgb
# import numpy as np
#
# _booster = xgb.Booster()
# _booster.load_model("models/landslide_xgb.json")
# MODEL_VERSION = "xgb-v1.0"
#
# def _predict_xgb(rainfall_mm: float, slope_deg: float, soil_moisture_pct: float) -> float:
#     features = np.array([[rainfall_mm, slope_deg, soil_moisture_pct]])
#     dmatrix = xgb.DMatrix(features, feature_names=["rainfall_mm", "slope_deg", "soil_moisture_pct"])
#     score = float(_booster.predict(dmatrix)[0])
#     return min(max(score, 0.0), 1.0)
# ---------------------------------------------------------------------------


def _predict_placeholder(rainfall_mm: float, slope_deg: float, soil_moisture_pct: float) -> float:
    """
    Simple weighted heuristic standing in for the trained model.
    Normalizes each input to a 0-1 sub-score, then combines them with
    weights that roughly reflect known landslide contributing factors
    (rainfall and soil saturation dominate; slope amplifies both).
    """
    rainfall_score = min(rainfall_mm / 100.0, 1.0)          # 100mm/hr ~ extreme
    soil_score = soil_moisture_pct / 100.0
    slope_score = min(slope_deg / 60.0, 1.0)                # >60deg ~ near-vertical

    weighted = (0.4 * rainfall_score) + (0.35 * soil_score) + (0.25 * slope_score)

    # Slope acts as a multiplier on saturation-driven risk, not just an
    # additive term — steep + saturated is disproportionately dangerous.
    interaction_boost = slope_score * soil_score * 0.15

    risk = min(weighted + interaction_boost, 1.0)
    return round(risk, 4)


def predict_risk(rainfall_mm: float, slope_deg: float, soil_moisture_pct: float) -> float:
    """
    Public entry point used by the API layer. Returns a risk score in [0, 1].
    """
    try:
        # Swap this line for `_predict_xgb(...)` once the real model is loaded
        score = _predict_placeholder(rainfall_mm, slope_deg, soil_moisture_pct)
        return score
    except Exception:
        logger.exception("Model inference failed, defaulting to safe unknown score")
        return 0.0


def risk_label(score: float) -> str:
    if score < 0.25:
        return "LOW"
    elif score < 0.5:
        return "MODERATE"
    elif score < 0.75:
        return "HIGH"
    return "CRITICAL"
