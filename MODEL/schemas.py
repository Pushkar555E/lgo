"""
Pydantic models for the landslide risk-scoring API.
"""

from pydantic import BaseModel, Field, confloat


class RiskScoreRequest(BaseModel):
    """
    Payload sent by the Node.js backend for a single GPS coordinate.

    rainfall_mm_override lets the caller pass a known rainfall value
    (e.g. from a local rain gauge) — if omitted, the service uses the
    live Open-Meteo figure for that coordinate instead.
    """

    latitude: confloat(ge=-90, le=90) = Field(..., example=22.5726)
    longitude: confloat(ge=-180, le=180) = Field(..., example=88.3639)

    slope_deg: confloat(ge=0, le=90) = Field(
        ..., description="Terrain slope angle in degrees at this point", example=34.2
    )
    soil_moisture_pct: confloat(ge=0, le=100) = Field(
        ..., description="Soil moisture percentage from nearest sensor/telemetry", example=68.5
    )
    rainfall_mm_override: float | None = Field(
        None, description="Optional manual rainfall value (mm) to bypass live fetch"
    )


class RiskScoreResponse(BaseModel):
    latitude: float
    longitude: float
    risk_score: float = Field(..., ge=0, le=1)
    risk_label: str
    rainfall_mm: float
    rainfall_source: str
    slope_deg: float
    soil_moisture_pct: float
    model_version: str
