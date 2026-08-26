import { useState } from "react";
import DisasterMap from "./DisasterMap";
import AlertsSidebar from "./AlertsSidebar";
import type { DistrictZoneProperties } from "../types/geo";

export default function DisasterDashboard() {
  const [selectedZone, setSelectedZone] = useState<DistrictZoneProperties | null>(null);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-base-950 text-text-primary">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-surface px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-lg font-bold tracking-tight">Bhoomi Watch</h1>
          <span className="font-mono text-xs text-text-muted">
            Landslide monitoring · West Bengal hill districts
          </span>
        </div>

        {selectedZone && (
          <div className="flex items-center gap-4 font-mono text-xs text-text-muted">
            <span>
              Selected: <span className="text-text-primary">{selectedZone.districtName}</span>
            </span>
            <span>
              Score: <span className="text-text-primary">{selectedZone.riskScore}/100</span>
            </span>
          </div>
        )}
      </header>

      {/* Body: map fills remaining space, sidebar fixed width */}
      <div className="flex flex-1 overflow-hidden">
        <main className="relative flex-1">
          <DisasterMap onZoneSelect={setSelectedZone} />
        </main>
        <div className="w-full max-w-sm shrink-0">
          <AlertsSidebar />
        </div>
      </div>
    </div>
  );
}
