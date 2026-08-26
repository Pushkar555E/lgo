import * as SQLite from "expo-sqlite";
import type { HazardReport } from "../types/hazardReport";

const DB_NAME = "hazard_reports.db";

let dbInstance: SQLite.SQLiteDatabase | null = null;

/**
 * Lazily opens (and migrates) the local database. Safe to call repeatedly —
 * subsequent calls reuse the same connection.
 */
async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;

  const db = await SQLite.openDatabaseAsync(DB_NAME);

  // WAL mode gives better durability + concurrent read/write behavior,
  // useful since the sync service reads while the form may be writing.
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS hazard_reports (
      id TEXT PRIMARY KEY NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      gps_accuracy_meters REAL,
      photo_uri TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'PENDING',
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_sync_error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_hazard_reports_sync_status
      ON hazard_reports (sync_status);
  `);

  dbInstance = db;
  return db;
}

function rowToReport(row: any): HazardReport {
  return {
    id: row.id,
    description: row.description,
    severity: row.severity,
    latitude: row.latitude,
    longitude: row.longitude,
    gpsAccuracyMeters: row.gps_accuracy_meters,
    photoUri: row.photo_uri,
    capturedAt: row.captured_at,
    syncStatus: row.sync_status,
    retryCount: row.retry_count,
    lastSyncError: row.last_sync_error,
  };
}

export async function insertReport(report: HazardReport): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO hazard_reports
       (id, description, severity, latitude, longitude, gps_accuracy_meters,
        photo_uri, captured_at, sync_status, retry_count, last_sync_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      report.id,
      report.description,
      report.severity,
      report.latitude,
      report.longitude,
      report.gpsAccuracyMeters,
      report.photoUri,
      report.capturedAt,
      report.syncStatus,
      report.retryCount,
      report.lastSyncError,
    ]
  );
}

export async function getPendingReports(): Promise<HazardReport[]> {
  const db = await getDb();
  // FAILED reports are retried too (up to the sync service's own cap) —
  // only SYNCED rows are excluded from the queue.
  const rows = await db.getAllAsync(
    `SELECT * FROM hazard_reports
     WHERE sync_status IN ('PENDING', 'FAILED')
     ORDER BY captured_at ASC`
  );
  return rows.map(rowToReport);
}

export async function getAllReports(): Promise<HazardReport[]> {
  const db = await getDb();
  const rows = await db.getAllAsync(`SELECT * FROM hazard_reports ORDER BY captured_at DESC`);
  return rows.map(rowToReport);
}

export async function markSyncing(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE hazard_reports SET sync_status = 'SYNCING' WHERE id = ?`, [id]);
}

export async function markSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE hazard_reports SET sync_status = 'SYNCED', last_sync_error = NULL WHERE id = ?`,
    [id]
  );
}

export async function markFailed(id: string, errorMessage: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE hazard_reports
     SET sync_status = 'FAILED', retry_count = retry_count + 1, last_sync_error = ?
     WHERE id = ?`,
    [errorMessage, id]
  );
}

/** Optional housekeeping: purge synced reports older than N days to keep the
 * local DB (and device storage used by cached photos) from growing forever. */
export async function pruneSyncedOlderThan(days: number): Promise<void> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  await db.runAsync(
    `DELETE FROM hazard_reports WHERE sync_status = 'SYNCED' AND captured_at < ?`,
    [cutoff]
  );
}
