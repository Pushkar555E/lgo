import type { AlertItem } from "../types/geo";

/**
 * Placeholder alerts feed. In production, replace with a poll/WebSocket
 * subscription against CitizenReports + SensorTelemetry anomaly rows
 * (see `is_anomalous` on sensor_telemetry and `status` on citizen_reports).
 */
export const alerts: AlertItem[] = [
  {
    id: "alert-001",
    districtName: "Darjeeling",
    riskLevel: "CRITICAL",
    message: "Tilt sensor DJ-14 exceeded 8° threshold after sustained rainfall.",
    reportedAt: "2026-08-26T09:42:00Z",
    coordinates: [88.262, 27.021],
  },
  {
    id: "alert-002",
    districtName: "Darjeeling",
    riskLevel: "CRITICAL",
    message: "Citizen report: visible ground cracking near NH110, Sonada village.",
    reportedAt: "2026-08-26T09:15:00Z",
    coordinates: [88.268, 27.032],
  },
  {
    id: "alert-003",
    districtName: "Kalimpong",
    riskLevel: "MODERATE",
    message: "Soil moisture at 74% and rising across 3 sensors in Relli Valley.",
    reportedAt: "2026-08-26T08:50:00Z",
    coordinates: [88.481, 27.045],
  },
  {
    id: "alert-004",
    districtName: "Kurseong",
    riskLevel: "LOW",
    message: "Routine check: all sensors nominal, rainfall within seasonal norms.",
    reportedAt: "2026-08-26T07:30:00Z",
    coordinates: [88.293, 26.921],
  },
];
