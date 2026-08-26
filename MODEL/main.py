"""
Landslide Predictive AI microservice.

Run:
    uvicorn main:app --reload --port 8001

Called by the Node.js/TypeScript backend as an internal service:
    POST http://localhost:8001/risk-score
"""

import asyncio
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import model
import rainfall_service
from schemas import RiskScoreRequest, RiskScoreResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger("landslide.api")

app = FastAPI(
    title="Landslide Predictive AI Service",
    description="Internal microservice: fuses live rainfall, slope, and soil moisture into a landslide risk score.",
    version="0.1.0",
)

# Allow the Node.js backend (adjust origin for production) to call this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your Node backend's origin in production
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_background_task: asyncio.Task | None = None


@app.on_event("startup")
async def start_background_tasks() -> None:
    """
    Kicks off the hourly rainfall-refresh loop as a long-running background
    task, decoupled from individual request/response cycles.
    """
    global _background_task
    _background_task = asyncio.create_task(rainfall_service.hourly_refresh_loop())
    logger.info("Started hourly rainfall background refresh task")


@app.on_event("shutdown")
async def stop_background_tasks() -> None:
    if _background_task:
        _background_task.cancel()
        logger.info("Stopped background rainfall refresh task")


@app.get("/health")
async def health_check() -> dict:
    return {"status": "ok", "model_version": model.MODEL_VERSION}


@app.post("/risk-score", response_model=RiskScoreResponse)
async def get_risk_score(payload: RiskScoreRequest) -> RiskScoreResponse:
    """
    Primary endpoint for the Node.js backend.

    Fuses live/cached hourly rainfall for the given coordinate with the
    slope and soil-moisture values supplied by the caller (typically pulled
    from RiskZones/SensorTelemetry in the Postgres/PostGIS layer), and
    returns a 0-1 risk score plus a human-readable label.
    """
    try:
        if payload.rainfall_mm_override is not None:
            rainfall_mm = payload.rainfall_mm_override
            rainfall_source = "override"
        else:
            reading = await rainfall_service.get_rainfall(payload.latitude, payload.longitude)
            rainfall_mm = reading.rainfall_mm
            rainfall_source = reading.source

        score = model.predict_risk(
            rainfall_mm=rainfall_mm,
            slope_deg=payload.slope_deg,
            soil_moisture_pct=payload.soil_moisture_pct,
        )

        return RiskScoreResponse(
            latitude=payload.latitude,
            longitude=payload.longitude,
            risk_score=score,
            risk_label=model.risk_label(score),
            rainfall_mm=rainfall_mm,
            rainfall_source=rainfall_source,
            slope_deg=payload.slope_deg,
            soil_moisture_pct=payload.soil_moisture_pct,
            model_version=model.MODEL_VERSION,
        )

    except Exception as exc:
        logger.exception("Risk score computation failed")
        raise HTTPException(status_code=500, detail=f"Risk score computation failed: {exc}") from exc
