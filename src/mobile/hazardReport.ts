export type SyncStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED";

export type HazardSeverity = "LOW" | "MODERATE" | "SEVERE";

/**
 * Shape of a single hazard report as stored in local SQLite. Mirrors the
 * fields the backend's CitizenReports table expects, plus sync-management
 * columns (syncStatus, retryCount) that never leave the device.
 */
export interface HazardReport {
  id: string; // client-generated UUID — doubles as idempotency key server-side
  description: string;
  severity: HazardSeverity;
  latitude: number;
  longitude: number;
  gpsAccuracyMeters: number | null;
  photoUri: string; // local file:// URI on device
  capturedAt: string; // ISO timestamp, set at capture time (not sync time)
  syncStatus: SyncStatus;
  retryCount: number;
  lastSyncError: string | null;
}

export type NewHazardReportInput = Omit<
  HazardReport,
  "id" | "syncStatus" | "retryCount" | "lastSyncError" | "capturedAt"
>;
