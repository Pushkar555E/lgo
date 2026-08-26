"""
Live rainfall data service backed by the free Open-Meteo API (no API key
required). Keeps an in-memory cache of watched coordinates and refreshes
them hourly via a background task, so request-time latency stays low.

Docs: https://open-meteo.com/en/docs
"""

import asyncio
import logging
import time
from dataclasses import dataclass

import httpx

logger = logging.getLogger("landslide.rainfall")

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
REFRESH_INTERVAL_SECONDS = 60 * 60  # hourly
CACHE_STALE_AFTER_SECONDS = 2 * 60 * 60  # fall back to re-fetch if >2h old
HTTP_TIMEOUT_SECONDS = 10.0


@dataclass
class RainfallReading:
    rainfall_mm: float
    fetched_at: float  # unix timestamp
    source: str  # "live" | "cached" | "fallback"


class RainfallCache:
    """
    Keyed on (lat, lon) rounded to 2 decimals (~1.1km precision) so nearby
    requests share a cache entry instead of hammering the upstream API.
    """

    def __init__(self) -> None:
        self._store: dict[tuple[float, float], RainfallReading] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _key(lat: float, lon: float) -> tuple[float, float]:
        return (round(lat, 2), round(lon, 2))

    async def get(self, lat: float, lon: float) -> RainfallReading | None:
        async with self._lock:
            return self._store.get(self._key(lat, lon))

    async def set(self, lat: float, lon: float, reading: RainfallReading) -> None:
        async with self._lock:
            self._store[self._key(lat, lon)] = reading

    async def watched_coordinates(self) -> list[tuple[float, float]]:
        async with self._lock:
            return list(self._store.keys())


cache = RainfallCache()


async def _fetch_live_rainfall(lat: float, lon: float) -> float:
    """
    Calls Open-Meteo for the current hour's precipitation figure at a
    coordinate. Raises on network/parse failure — caller decides fallback.
    """
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "precipitation",
        "forecast_days": 1,
        "timezone": "auto",
    }
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        response = await client.get(OPEN_METEO_URL, params=params)
        response.raise_for_status()
        data = response.json()

    hourly = data.get("hourly", {})
    times: list[str] = hourly.get("time", [])
    precipitation: list[float] = hourly.get("precipitation", [])

    if not times or not precipitation:
        raise ValueError("Open-Meteo response missing hourly precipitation data")

    # Find the entry closest to the current hour
    now_hour_str = time.strftime("%Y-%m-%dT%H:00", time.localtime())
    if now_hour_str in times:
        idx = times.index(now_hour_str)
    else:
        idx = 0  # fall back to the first forecast hour

    return float(precipitation[idx])


async def get_rainfall(lat: float, lon: float, force_refresh: bool = False) -> RainfallReading:
    """
    Primary accessor used by the API layer. Serves from cache when fresh;
    otherwise fetches live and populates the cache for the background
    refresher to pick up going forward.
    """
    cached = await cache.get(lat, lon)
    is_stale = cached is None or (time.time() - cached.fetched_at) > CACHE_STALE_AFTER_SECONDS

    if cached and not is_stale and not force_refresh:
        return RainfallReading(cached.rainfall_mm, cached.fetched_at, source="cached")

    try:
        rainfall_mm = await _fetch_live_rainfall(lat, lon)
        reading = RainfallReading(rainfall_mm, time.time(), source="live")
        await cache.set(lat, lon, reading)
        return reading
    except Exception:
        logger.exception("Live rainfall fetch failed for (%s, %s)", lat, lon)
        if cached:
            # Serve stale data rather than fail the whole risk-score request
            return RainfallReading(cached.rainfall_mm, cached.fetched_at, source="fallback")
        # No cache and no live data — return 0mm so the model degrades
        # gracefully instead of throwing at the API boundary.
        return RainfallReading(0.0, time.time(), source="fallback")


async def hourly_refresh_loop() -> None:
    """
    Background task: every hour, re-fetch rainfall for every coordinate
    that's been requested at least once. Registered as a FastAPI startup
    background task in main.py.
    """
    while True:
        await asyncio.sleep(REFRESH_INTERVAL_SECONDS)
        coords = await cache.watched_coordinates()
        logger.info("Refreshing rainfall cache for %d watched coordinates", len(coords))
        for lat, lon in coords:
            try:
                await get_rainfall(lat, lon, force_refresh=True)
            except Exception:
                logger.exception("Background refresh failed for (%s, %s)", lat, lon)
