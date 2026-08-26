/**
 * LIVE DEMO SIMULATOR — Landslide Monitoring System
 * ---------------------------------------------------------------------
 * Injects a realistic escalating sequence of sensor readings (rainfall,
 * soil moisture, tilt angle) for a fixed demo sensor inside the
 * Darjeeling risk zone, so judges watch the dashboard map climb from
 * green -> amber -> red in real time, ending with a triggered SMS alert.
 *
 * Usage:
 *   cp .env.example .env   # fill in DATABASE_URL, AI_SERVICE_URL, Twilio (optional)
 *   node simulate.js
 *
 * Rehearse timing without touching any real infra:
 *   DRY_RUN=true node simulate.js
 * ---------------------------------------------------------------------
 */

require("dotenv").config();
const axios = require("axios");
const { ensureDemoSensor, insertTelemetryReading, closePool } = require("./db");
const { sendCriticalAlertSms } = require("./smsService");

const DRY_RUN = process.env.DRY_RUN === "true";
const STEP_DELAY_MS = Number(process.env.STEP_DELAY_MS || 2500);
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8001";
const CRITICAL_SCORE_THRESHOLD = 0.75;

// Fixed slope for the demo sensor's location — matches a real steep
// Darjeeling hillside grade; adjust if your AI model was tuned differently.
const DEMO_SLOPE_DEG = 42.5;

// The escalation sequence. Each step is a plausible reading progression
// for an actual rainfall-triggered landslide event, not just linear
// ramp-up — moisture and tilt often plateau briefly before the final spike.
const ESCALATION_STEPS = [
  { label: "Baseline",      soilMoisturePct: 42, tiltAngleDeg: 1.1, rainfallMm: 4,  isAnomalous: false },
  { label: "Rain starting", soilMoisturePct: 51, tiltAngleDeg: 1.6, rainfallMm: 18, isAnomalous: false },
  { label: "Saturating",    soilMoisturePct: 63, tiltAngleDeg: 3.2, rainfallMm: 34, isAnomalous: false },
  { label: "High risk",     soilMoisturePct: 74, tiltAngleDeg: 5.8, rainfallMm: 52, isAnomalous: true  },
  { label: "CRITICAL",      soilMoisturePct: 86, tiltAngleDeg: 9.4, rainfallMm: 78, isAnomalous: true  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getRiskScore({ rainfallMm, soilMoisturePct }) {
  if (DRY_RUN) {
    // Rough local approximation so dry-run output still looks sane —
    // mirrors the placeholder formula in the Python service.
    const rainfallScore = Math.min(rainfallMm / 100, 1);
    const soilScore = soilMoisturePct / 100;
    const slopeScore = Math.min(DEMO_SLOPE_DEG / 60, 1);
    const score = Math.min(0.4 * rainfallScore + 0.35 * soilScore + 0.25 * slopeScore, 1);
    return { riskScore: Number(score.toFixed(4)), riskLabel: score > 0.75 ? "CRITICAL" : "MODERATE" };
  }

  const response = await axios.post(`${AI_SERVICE_URL}/risk-score`, {
    latitude: 27.021,
    longitude: 88.262,
    slope_deg: DEMO_SLOPE_DEG,
    soil_moisture_pct: soilMoisturePct,
    rainfall_mm_override: rainfallMm,
  });

  return { riskScore: response.data.risk_score, riskLabel: response.data.risk_label };
}

async function runSimulation() {
  console.log("=".repeat(60));
  console.log("  LANDSLIDE MONITORING — LIVE DEMO SIMULATION");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no DB/AI/SMS calls)" : "LIVE"}`);
  console.log("=".repeat(60), "\n");

  let sensor = { sensorId: "dry-run-sensor", longitude: 88.262, latitude: 27.021 };

  if (!DRY_RUN) {
    console.log("→ Seeding demo sensor in Darjeeling risk zone...");
    sensor = await ensureDemoSensor();
    console.log(`  Sensor ready: ${sensor.sensorId}\n`);
  }

  let alertFired = false;

  for (const [index, step] of ESCALATION_STEPS.entries()) {
    console.log(`[Step ${index + 1}/${ESCALATION_STEPS.length}] ${step.label}`);
    console.log(
      `  rainfall=${step.rainfallMm}mm  soil_moisture=${step.soilMoisturePct}%  tilt=${step.tiltAngleDeg}°`
    );

    if (!DRY_RUN) {
      await insertTelemetryReading({
        sensorId: sensor.sensorId,
        longitude: sensor.longitude,
        latitude: sensor.latitude,
        soilMoisturePct: step.soilMoisturePct,
        tiltAngleDeg: step.tiltAngleDeg,
        rainfallMm: step.rainfallMm,
        isAnomalous: step.isAnomalous,
      });
    }

    try {
      const { riskScore, riskLabel } = await getRiskScore({
        rainfallMm: step.rainfallMm,
        soilMoisturePct: step.soilMoisturePct,
      });
      console.log(`  -> AI risk score: ${riskScore} (${riskLabel})`);

      if (!alertFired && riskScore >= CRITICAL_SCORE_THRESHOLD) {
        alertFired = true;
        console.log("  -> CRITICAL threshold crossed — firing SMS alert");
        await sendCriticalAlertSms({
          districtName: "Darjeeling",
          riskScore,
          tiltAngleDeg: step.tiltAngleDeg,
          rainfallMm: step.rainfallMm,
        });
      }
    } catch (err) {
      console.error("  ! AI service call failed:", err.message);
      console.error("    (Is the FastAPI service running at", AI_SERVICE_URL, "?)");
    }

    console.log("");
    if (index < ESCALATION_STEPS.length - 1) {
      await sleep(STEP_DELAY_MS);
    }
  }

  console.log("=".repeat(60));
  console.log(alertFired ? "  Demo complete — alert triggered." : "  Demo complete — threshold not reached.");
  console.log("=".repeat(60));

  if (!DRY_RUN) {
    await closePool();
  }
}

runSimulation().catch((err) => {
  console.error("\nSimulation failed:", err);
  process.exit(1);
});
