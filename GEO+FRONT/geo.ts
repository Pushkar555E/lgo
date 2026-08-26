import type { Feature, FeatureCollection, Polygon } from "geojson";

export type RiskLevel = "LOW" | "MODERATE" | "CRITICAL";

/**
 * Properties attached to each district zone polygon feature.
 * Extend this as your PostGIS RiskZones table grows more fields.
 */
export interface DistrictZoneProperties {
  zoneId: string;
  districtName: string;
  riskLevel: RiskLevel;
  riskScore: number; // 0-100, mirrors risk_score in the RiskZones table
  populationEstimate: number;
  lastAssessedAt: string; // ISO timestamp
}

export type DistrictZoneFeature = Feature<Polygon, DistrictZoneProperties>;
export type DistrictZoneCollection = FeatureCollection<Polygon, DistrictZoneProperties>;

export interface AlertItem {
  id: string;
  districtName: string;
  riskLevel: RiskLevel;
  message: string;
  reportedAt: string; // ISO timestamp
  coordinates: [number, number]; // [lng, lat]
}

/** Maps a risk level to its design-token color, kept in one place so the
 * map layer paint expressions and the sidebar badges never drift apart. */
export const RISK_COLORS: Record<RiskLevel, string> = {
  LOW: "#5B9279",
  MODERATE: "#D9A441",
  CRITICAL: "#C4453C",
};
