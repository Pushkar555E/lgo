import { alerts } from "./alerts";
import { RISK_COLORS, type AlertItem, type RiskLevel } from "./geo";

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span
      className="rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider"
      style={{
        color: RISK_COLORS[level],
        backgroundColor: `${RISK_COLORS[level]}1A`, // ~10% opacity tint of the same color
        border: `1px solid ${RISK_COLORS[level]}40`,
      }}
    >
      {level}
    </span>
  );
}

function AlertCard({ alert }: { alert: AlertItem }) {
  const isCritical = alert.riskLevel === "CRITICAL";

  return (
    <li className="border-b border-border-subtle px-4 py-3 transition-colors hover:bg-white/[0.03]">
      <div className="flex items-start gap-3">
        <span className="relative mt-1 flex h-2 w-2 shrink-0">
          {isCritical && (
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              style={{ backgroundColor: RISK_COLORS[alert.riskLevel] }}
            />
          )}
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{ backgroundColor: RISK_COLORS[alert.riskLevel] }}
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-text-primary">
              {alert.districtName}
            </span>
            <RiskBadge level={alert.riskLevel} />
          </div>
          <p className="text-sm leading-snug text-text-muted">{alert.message}</p>
          <p className="mt-1.5 font-mono text-[11px] text-text-muted/70">
            {timeAgo(alert.reportedAt)} · {alert.coordinates[1].toFixed(3)},{" "}
            {alert.coordinates[0].toFixed(3)}
          </p>
        </div>
      </div>
    </li>
  );
}

export default function AlertsSidebar() {
  const criticalCount = alerts.filter((a) => a.riskLevel === "CRITICAL").length;

  return (
    <aside className="flex h-full w-full flex-col border-l border-border-subtle bg-surface">
      <div className="border-b border-border-subtle px-4 py-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-text-primary">
            Active alerts
          </h2>
          {criticalCount > 0 && (
            <span className="rounded-full bg-risk-critical/15 px-2 py-0.5 font-mono text-xs font-semibold text-risk-critical">
              {criticalCount} critical
            </span>
          )}
        </div>
        <p className="mt-1 font-mono text-[11px] text-text-muted">
          Live feed · sensor + citizen reports
        </p>
      </div>

      <ul className="flex-1 overflow-y-auto">
        {alerts
          .slice()
          .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())
          .map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
      </ul>
    </aside>
  );
}
