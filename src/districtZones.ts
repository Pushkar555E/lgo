import type { DistrictZoneCollection } from "./geo";

/**
 * Placeholder district polygons for the North Eastern Region (NER).
 * Used for AI-Based early warning and landslide Risk Monitoring visualization.
 */
export const districtZones: DistrictZoneCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        zoneId: "zone-east-khasi",
        districtName: "East Khasi Hills",
        riskLevel: "CRITICAL",
        riskScore: 89,
        populationEstimate: 825922,
        lastAssessedAt: "2026-08-25T06:00:00Z",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [91.5, 25.7],
            [92.1, 25.7],
            [92.2, 25.2],
            [91.6, 25.2],
            [91.5, 25.7],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        zoneId: "zone-dima-hasao",
        districtName: "Dima Hasao",
        riskLevel: "CRITICAL",
        riskScore: 82,
        populationEstimate: 214102,
        lastAssessedAt: "2026-08-25T06:00:00Z",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [92.7, 25.5],
            [93.3, 25.6],
            [93.4, 25.0],
            [92.8, 24.9],
            [92.7, 25.5],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        zoneId: "zone-tawang",
        districtName: "Tawang",
        riskLevel: "MODERATE",
        riskScore: 65,
        populationEstimate: 49977,
        lastAssessedAt: "2026-08-25T06:00:00Z",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [91.7, 27.7],
            [92.1, 27.7],
            [92.2, 27.4],
            [91.8, 27.3],
            [91.7, 27.7],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: {
        zoneId: "zone-aizawl",
        districtName: "Aizawl",
        riskLevel: "LOW",
        riskScore: 28,
        populationEstimate: 400309,
        lastAssessedAt: "2026-08-25T06:00:00Z",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [92.6, 23.9],
            [92.9, 23.9],
            [93.0, 23.5],
            [92.7, 23.5],
            [92.6, 23.9],
          ],
        ],
      },
    },
  ],
};
