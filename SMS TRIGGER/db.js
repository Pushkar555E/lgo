const { Pool } = require("pg");

const DEMO_SENSOR_SERIAL = "DEMO-DJ-14";
const DEMO_SENSOR_ID = "11111111-1111-4111-a111-111111111111"; // fixed UUID, easy to spot in demo/db
// Coordinates fall inside the Darjeeling risk-zone polygon used in the
// React dashboard's dummy GeoJSON, so the dashboard map lights up the
// correct district when this sensor reports critical readings.
const DEMO_SENSOR_LON = 88.262;
const DEMO_SENSOR_LAT = 27.021;

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

/**
 * Idempotently ensures the demo sensor row exists, linked to the
 * Darjeeling risk zone if one is found by name. Safe to call every run —
 * ON CONFLICT just no-ops on repeat.
 */
async function ensureDemoSensor() {
  const db = getPool();

  const zoneResult = await db.query(
    `SELECT risk_zone_id FROM risk_zones WHERE zone_name = $1 LIMIT 1`,
    ["Darjeeling"]
  );
  const riskZoneId = zoneResult.rows[0]?.risk_zone_id ?? null;

  if (!riskZoneId) {
    console.warn(
      "  ! No 'Darjeeling' risk zone found — seed risk_zones first if you want the map to color correctly."
    );
  }

  await db.query(
    `INSERT INTO sensors (sensor_id, device_serial, sensor_type, status, install_geom, risk_zone_id)
     VALUES ($1, $2, 'MULTI_PARAMETER', 'ACTIVE', ST_SetSRID(ST_MakePoint($3, $4), 4326), $5)
     ON CONFLICT (device_serial) DO UPDATE SET status = 'ACTIVE', last_heartbeat_at = now()`,
    [DEMO_SENSOR_ID, DEMO_SENSOR_SERIAL, DEMO_SENSOR_LON, DEMO_SENSOR_LAT, riskZoneId]
  );

  return { sensorId: DEMO_SENSOR_ID, longitude: DEMO_SENSOR_LON, latitude: DEMO_SENSOR_LAT };
}

/**
 * Inserts one telemetry reading and fires a pg_notify on the
 * 'telemetry_updates' channel so any LISTENing backend process (your
 * Node API's websocket relay) can push it to the dashboard instantly,
 * instead of the dashboard having to poll.
 */
async function insertTelemetryReading({ sensorId, longitude, latitude, soilMoisturePct, tiltAngleDeg, rainfallMm, isAnomalous }) {
  const db = getPool();

  const insertResult = await db.query(
    `INSERT INTO sensor_telemetry
       (sensor_id, geom, soil_moisture_pct, tilt_angle_deg, rainfall_mm, is_anomalous, recorded_at)
     VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5, $6, $7, now())
     RETURNING telemetry_id, recorded_at`,
    [sensorId, longitude, latitude, soilMoisturePct, tiltAngleDeg, rainfallMm, isAnomalous]
  );

  const payload = JSON.stringify({
    sensorId,
    soilMoisturePct,
    tiltAngleDeg,
    rainfallMm,
    isAnomalous,
    recordedAt: insertResult.rows[0].recorded_at,
  });

  // pg_notify payloads are capped at 8000 bytes — comfortably fine here.
  await db.query(`SELECT pg_notify('telemetry_updates', $1)`, [payload]);

  return insertResult.rows[0];
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { ensureDemoSensor, insertTelemetryReading, closePool };
