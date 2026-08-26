import type { DistrictZoneCollection } from "../types/geo";

/**
 * Placeholder district polygons approximating the Darjeeling-Kalimpong
 * hill belt (a real landslide-prone corridor in West Bengal). Swap this
 * static file for a fetch against your PostGIS `risk_zones` table's
 * GeoJSON export endpoint once the backend is wired up:
 *
 *   GET /api/risk-zones -> ST_AsGeoJSON aggregate from the RiskZones table
 */
export const districtZones: DistrictZoneCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        zoneId: "zone-darjeeling",
        districtName: "Darjeeling",
        riskLevel: "CRITICAL",
        riskScore: 82,
        populationEstimate: 46000,
        lastAssessedAt: "2026-08-25T06:00:00Z",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [88.24, 27.05],
            [88.3, 27.05],
            [88.31, 27.02],
            [88.27, 26.99],
            [88.22, 27.0],
            [88.24, 27.05],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        zoneId: "zone-kalimpong",
        districtName: "Kalimpong",
        riskLevel: "MODERATE",
        riskScore: 54,
        populationEstimate: 31000,
        lastAssessedAt: "2026-08-25T06:00:00Z",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [88.45, 27.08],
            [88.52, 27.07],
            [88.53, 27.03],
            [88.47, 27.01],
            [88.43, 27.04],
            [88.45, 27.08],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        zoneId: "zone-kurseong",
        districtName: "Kurseong",
        riskLevel: "LOW",
        riskScore: 21,
        populationEstimate: 18500,
        lastAssessedAt: "2026-08-25T06:00:00Z",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [88.27, 26.95],
            [88.33, 26.94],
            [88.34, 26.9],
            [88.28, 26.89],
            [88.25, 26.92],
            [88.27, 26.95],
          ],
        ],
      },
    },
  ],
};
