/**
 * SMS alerting via Twilio. Runs in MOCK MODE automatically whenever Twilio
 * credentials aren't set — logs what would have been sent instead of
 * throwing. This means the demo script never crashes mid-pitch just
 * because nobody set up a Twilio trial account.
 */

const twilioCredsPresent = Boolean(
  process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER &&
    process.env.ALERT_PHONE_NUMBER
);

let twilioClient = null;
if (twilioCredsPresent && process.env.DRY_RUN !== "true") {
  const twilio = require("twilio");
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

/**
 * Sends (or mock-logs) a critical hazard SMS alert.
 * @param {{ districtName: string, riskScore: number, tiltAngleDeg: number, rainfallMm: number }} params
 */
async function sendCriticalAlertSms({ districtName, riskScore, tiltAngleDeg, rainfallMm }) {
  const message =
    `🚨 LANDSLIDE ALERT: ${districtName} — CRITICAL risk (score ${riskScore.toFixed(2)}). ` +
    `Tilt ${tiltAngleDeg.toFixed(1)}° | Rainfall ${rainfallMm.toFixed(0)}mm/hr. Evacuate low-lying areas immediately.`;

  if (!twilioClient) {
    console.log("\n[SMS - MOCK MODE] Would send to", process.env.ALERT_PHONE_NUMBER || "(no number configured)");
    console.log("[SMS - MOCK MODE]", message, "\n");
    return { mocked: true, message };
  }

  const result = await twilioClient.messages.create({
    body: message,
    from: process.env.TWILIO_FROM_NUMBER,
    to: process.env.ALERT_PHONE_NUMBER,
  });

  console.log(`\n[SMS SENT] SID: ${result.sid} -> ${process.env.ALERT_PHONE_NUMBER}\n`);
  return { mocked: false, sid: result.sid, message };
}

module.exports = { sendCriticalAlertSms, isMockMode: !twilioClient };
