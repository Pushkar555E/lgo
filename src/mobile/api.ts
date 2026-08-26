import axios from "axios";
import type { HazardReport } from "../types/hazardReport";

// Point this at your Node.js backend's CitizenReports ingestion endpoint.
const API_BASE_URL = "https://your-backend.example.com/api";
const UPLOAD_TIMEOUT_MS = 30000;

/**
 * Uploads a single report, including its photo, as multipart/form-data.
 * Throws on any non-2xx response or network failure — the sync service
 * decides what to do with that (mark FAILED, retry later).
 */
export async function uploadHazardReport(report: HazardReport): Promise<void> {
  const formData = new FormData();

  formData.append("clientReportId", report.id); // idempotency key server-side
  formData.append("description", report.description);
  formData.append("severity", report.severity);
  formData.append("latitude", String(report.latitude));
  formData.append("longitude", String(report.longitude));
  formData.append("capturedAt", report.capturedAt);
  if (report.gpsAccuracyMeters != null) {
    formData.append("gpsAccuracyMeters", String(report.gpsAccuracyMeters));
  }

  // React Native's fetch/FormData accepts this { uri, name, type } shape
  // directly for local file URIs — no need to read the file into memory.
  formData.append("photo", {
    uri: report.photoUri,
    name: `${report.id}.jpg`,
    type: "image/jpeg",
  } as unknown as Blob);

  await axios.post(`${API_BASE_URL}/citizen-reports`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: UPLOAD_TIMEOUT_MS,
  });
}
