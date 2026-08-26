import type { AlertItem } from "./geo";

/**
 * Placeholder alerts feed. In production, replace with a poll/WebSocket
 * subscription against CitizenReports + SensorTelemetry anomaly rows
 * (see `is_anomalous` on sensor_telemetry and `status` on citizen_reports).
 */
export const alerts: AlertItem[] = [
  {
    id: "alert-001",
    districtName: "East Khasi Hills",
    riskLevel: "CRITICAL",
    message: "AI Model Prediction: 89% probability of slope failure within 48h due to sustained rainfall.",
    reportedAt: "2026-08-26T09:42:00Z",
    coordinates: [91.88, 25.57],
  },
  {
    id: "alert-002",
    districtName: "Dima Hasao",
    riskLevel: "CRITICAL",
    message: "Citizen report: visible ground cracking near NH-27, Haflong.",
    reportedAt: "2026-08-26T09:15:00Z",
    coordinates: [93.02, 25.17],
  },
  {
    id: "alert-003",
    districtName: "Tawang",
    riskLevel: "MODERATE",
    message: "Satellite imagery detects soil moisture at 78% and rising across 3 zones.",
    reportedAt: "2026-08-26T08:50:00Z",
    coordinates: [91.86, 27.58],
  },
  {
    id: "alert-004",
    districtName: "Aizawl",
    riskLevel: "LOW",
    message: "Routine AI check: sensors nominal, terrain stability within seasonal norms.",
    reportedAt: "2026-08-26T07:30:00Z",
    coordinates: [92.71, 23.73],
  },
];
