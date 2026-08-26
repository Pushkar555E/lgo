import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { districtZones } from "./districtZones";
import { RISK_COLORS, type DistrictZoneProperties } from "./geo";
const INITIAL_CENTER: [number, number] = [88.35, 27.0]; // Darjeeling-Kalimpong hill belt
const INITIAL_ZOOM = 10.2;

interface DisasterMapProps {
  onZoneSelect?: (zone: DistrictZoneProperties | null) => void;
}

export default function DisasterMap({ onZoneSelect }: DisasterMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Initialize the map once on mount
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: 40
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => {
      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Add data layers once the map + style have finished loading
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!map.getSource("district-zones")) {
      map.addSource("district-zones", {
        type: "geojson",
        data: districtZones,
      });

      // Fill layer — colored by risk level via a `match` expression so the
      // color logic lives in one place (RISK_COLORS) and stays in sync
      // with the sidebar badges.
      map.addLayer({
        id: "district-zones-fill",
        type: "fill",
        source: "district-zones",
        paint: {
          "fill-color": [
            "match",
            ["get", "riskLevel"],
            "CRITICAL",
            RISK_COLORS.CRITICAL,
            "MODERATE",
            RISK_COLORS.MODERATE,
            "LOW",
            RISK_COLORS.LOW,
            "#4A5568",
          ],
          "fill-opacity": 0.45,
        },
      });

      map.addLayer({
        id: "district-zones-outline",
        type: "line",
        source: "district-zones",
        paint: {
          "line-color": [
            "match",
            ["get", "riskLevel"],
            "CRITICAL",
            RISK_COLORS.CRITICAL,
            "MODERATE",
            RISK_COLORS.MODERATE,
            "LOW",
            RISK_COLORS.LOW,
            "#4A5568",
          ],
          "line-width": 2,
        },
      });

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });

      map.on("mousemove", "district-zones-fill", (e: any) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = e.features?.[0];
        if (!feature) return;
        const props = feature.properties as DistrictZoneProperties;

        popup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #14171C;">
               <strong>${props.districtName}</strong><br/>
               Risk score: ${props.riskScore}/100<br/>
               Population: ${Number(props.populationEstimate).toLocaleString()}
             </div>`
          )
          .addTo(map);
      });

      map.on("mouseleave", "district-zones-fill", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      map.on("click", "district-zones-fill", (e: any) => {
        const feature = e.features?.[0];
        if (feature && onZoneSelect) {
          onZoneSelect(feature.properties as DistrictZoneProperties);
        }
      });
    }
  }, [mapReady, onZoneSelect]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Risk legend, content-justified overlay (not decorative chrome) */}
      <div className="absolute bottom-6 left-6 rounded-md border border-border-subtle bg-surface/90 px-4 py-3 backdrop-blur-sm">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-text-muted">
          Risk level
        </p>
        <div className="flex flex-col gap-1.5">
          {(["CRITICAL", "MODERATE", "LOW"] as const).map((level) => (
            <div key={level} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: RISK_COLORS[level] }}
              />
              <span className="text-xs text-text-primary">{level}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
