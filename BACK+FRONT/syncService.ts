import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import {
  getPendingReports,
  markSyncing,
  markSynced,
  markFailed,
} from "../db/hazardReportDb";
import { uploadHazardReport } from "./api";

const MAX_RETRY_COUNT = 5;

let isSyncing = false; // simple in-process lock — prevents overlapping drain runs
let unsubscribeNetInfo: (() => void) | null = null;

type SyncListener = (event: { syncing: boolean; synced: number; failed: number }) => void;
const listeners = new Set<SyncListener>();

export function onSyncStatusChange(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(event: { syncing: boolean; synced: number; failed: number }) {
  listeners.forEach((l) => l(event));
}

/**
 * Drains every PENDING/FAILED (under retry cap) report from the local queue,
 * uploading them one at a time. Sequential rather than parallel on purpose —
 * field connectivity after a storm is often a weak/flaky single bar, and
 * parallel multipart photo uploads are more likely to all time out than one
 * at a time succeeding.
 */
export async function drainSyncQueue(): Promise<void> {
  if (isSyncing) return; // already draining — the in-flight run will pick up new items next pass
  isSyncing = true;

  let syncedCount = 0;
  let failedCount = 0;

  try {
    const pending = await getPendingReports();
    notify({ syncing: true, synced: 0, failed: 0 });

    for (const report of pending) {
      if (report.retryCount >= MAX_RETRY_COUNT) {
        // Leave it marked FAILED — surfaced in the UI for manual review
        // (e.g. corrupted photo file) rather than retried forever.
        failedCount++;
        continue;
      }

      // Re-check connectivity before each upload — a queue of 20 reports
      // over a spotty signal can lose the connection partway through.
      const netState = await NetInfo.fetch();
      if (!netState.isConnected || !netState.isInternetReachable) {
        break;
      }

      try {
        await markSyncing(report.id);
        await uploadHazardReport(report);
        await markSynced(report.id);
        syncedCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown upload error";
        await markFailed(report.id, message);
        failedCount++;
      }
    }
  } finally {
    isSyncing = false;
    notify({ syncing: false, synced: syncedCount, failed: failedCount });
  }
}

/**
 * Call once at app startup. Wires a NetInfo listener that triggers a queue
 * drain the moment connectivity is (re)established, and attempts an initial
 * drain immediately in case reports were queued during a previous session
 * that ended before reconnecting.
 */
export function startAutoSync(): () => void {
  if (unsubscribeNetInfo) return unsubscribeNetInfo; // already started

  let wasConnected: boolean | null = null;

  const handleConnectivityChange = (state: NetInfoState) => {
    const isConnected = Boolean(state.isConnected && state.isInternetReachable);

    // Only trigger on the *transition* into connectivity, not on every
    // NetInfo event (which fires for signal-strength changes etc. too).
    if (isConnected && wasConnected !== true) {
      drainSyncQueue().catch(() => {
        // drainSyncQueue already records per-report errors in SQLite;
        // this catch only guards against an unexpected top-level throw.
      });
    }
    wasConnected = isConnected;
  };

  unsubscribeNetInfo = NetInfo.addEventListener(handleConnectivityChange);

  // Fire once on startup in case we're already online with a backlog
  NetInfo.fetch().then(handleConnectivityChange);

  return () => {
    unsubscribeNetInfo?.();
    unsubscribeNetInfo = null;
  };
}
