-- ============================================================================
-- SIH LANDSLIDE MONITORING SYSTEM — DATABASE SCHEMA
-- PostgreSQL 15+ / PostGIS 3.3+
-- Author: Senior DB Architect design pass
-- ============================================================================
-- Design goals:
--   1. Real-time ingestion of high-frequency sensor telemetry (point data)
--   2. Fast "is this point/sensor inside a risk zone" queries (polygon data)
--   3. Citizen-reported incidents geotagged and triageable
--   4. Query performance at scale via GIST spatial indexes, time partitioning,
--      and BRIN indexes on monotonically increasing timestamp columns
-- ============================================================================


-- ============================================================================
-- 0. DATABASE & EXTENSIONS
-- ============================================================================

-- Run as superuser, then \c into the new DB before the rest of this script
-- CREATE DATABASE landslide_monitoring;
-- \c landslide_monitoring

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- fuzzy text search (zone/report search)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- uuid_generate_v4()

-- Sanity check
SELECT postgis_full_version();


-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================

CREATE TYPE risk_level_enum AS ENUM ('LOW', 'MODERATE', 'HIGH', 'CRITICAL');
CREATE TYPE sensor_type_enum AS ENUM ('SOIL_MOISTURE', 'TILTMETER', 'PIEZOMETER', 'RAIN_GAUGE', 'MULTI_PARAMETER');
CREATE TYPE sensor_status_enum AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'FAULT');
CREATE TYPE report_status_enum AS ENUM ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'ESCALATED');
CREATE TYPE report_severity_enum AS ENUM ('MINOR', 'MODERATE', 'SEVERE', 'CATASTROPHIC');


-- ============================================================================
-- 2. TRIGGER FUNCTION — auto-update `updated_at`
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 3. RISK ZONES  (Polygon geometry)
-- ============================================================================
-- One row per delineated hazard zone (e.g. a slope segment, a village buffer
-- area). Polygons are typically authored in GIS tools (QGIS) and imported.

CREATE TABLE risk_zones (
    risk_zone_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_name            VARCHAR(150) NOT NULL,
    district             VARCHAR(100) NOT NULL,
    state                VARCHAR(100) NOT NULL,
    risk_level           risk_level_enum NOT NULL DEFAULT 'LOW',
    risk_score           NUMERIC(5,2) CHECK (risk_score BETWEEN 0 AND 100),
    population_estimate  INTEGER CHECK (population_estimate >= 0),

    -- Core geometry — SRID 4326 (WGS84), validated on write
    geom                 GEOMETRY(POLYGON, 4326) NOT NULL,

    -- Cached derived metrics, refreshed via trigger — avoids recomputing
    -- ST_Area on every read for dashboards/list views
    area_sq_km           NUMERIC(10,4),
    centroid             GEOMETRY(POINT, 4326),

    last_assessed_at     TIMESTAMPTZ,
    assessed_by          VARCHAR(150),
    notes                TEXT,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_valid_geom CHECK (ST_IsValid(geom))
);

-- Auto-populate area_sq_km + centroid whenever geometry changes
CREATE OR REPLACE FUNCTION trg_risk_zone_geom_derived()
RETURNS TRIGGER AS $$
BEGIN
    -- geography cast gives accurate area in m² regardless of latitude distortion
    NEW.area_sq_km := ST_Area(NEW.geom::geography) / 1000000.0;
    NEW.centroid   := ST_Centroid(NEW.geom);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER risk_zones_geom_derived
BEFORE INSERT OR UPDATE OF geom ON risk_zones
FOR EACH ROW EXECUTE FUNCTION trg_risk_zone_geom_derived();

CREATE TRIGGER risk_zones_set_updated_at
BEFORE UPDATE ON risk_zones
FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- Spatial index — critical for ST_Contains / ST_Intersects / ST_DWithin
CREATE INDEX idx_risk_zones_geom ON risk_zones USING GIST (geom);
CREATE INDEX idx_risk_zones_centroid ON risk_zones USING GIST (centroid);
CREATE INDEX idx_risk_zones_risk_level ON risk_zones (risk_level) WHERE risk_level IN ('HIGH', 'CRITICAL');
CREATE INDEX idx_risk_zones_district ON risk_zones (district, state);


-- ============================================================================
-- 4. SENSORS  (device registry — master table)
-- ============================================================================
-- Keeping device metadata separate from telemetry readings is a deliberate
-- normalization: install_geom rarely changes, telemetry rows arrive at high
-- frequency. Joining a skinny telemetry table to this table is cheap.

CREATE TABLE sensors (
    sensor_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_serial        VARCHAR(100) UNIQUE NOT NULL,
    sensor_type           sensor_type_enum NOT NULL,
    status                sensor_status_enum NOT NULL DEFAULT 'ACTIVE',

    install_geom          GEOMETRY(POINT, 4326) NOT NULL,
    install_elevation_m    NUMERIC(7,2),

    risk_zone_id          UUID REFERENCES risk_zones(risk_zone_id) ON DELETE SET NULL,

    battery_capacity_mah   INTEGER,
    firmware_version       VARCHAR(30),
    installed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_heartbeat_at        TIMESTAMPTZ,

    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER sensors_set_updated_at
BEFORE UPDATE ON sensors
FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE INDEX idx_sensors_geom ON sensors USING GIST (install_geom);
CREATE INDEX idx_sensors_risk_zone ON sensors (risk_zone_id);
CREATE INDEX idx_sensors_status ON sensors (status) WHERE status = 'ACTIVE';


-- ============================================================================
-- 5. SENSOR TELEMETRY  (Point data, high-frequency time-series)
-- ============================================================================
-- This is the highest write-volume table in the system (potentially every
-- few seconds per sensor across thousands of sensors). It is:
--   - PARTITIONED by RANGE on recorded_at (monthly) so old data can be
--     archived/dropped cheaply and queries auto-prune irrelevant partitions
--   - Indexed with GIST for spatial queries and BRIN for time-range scans
--     (BRIN is far smaller/cheaper than BTREE for append-only, ordered data)
--
-- NOTE: for very high ingest rates, consider the TimescaleDB extension
-- (hypertables) as a drop-in replacement for native partitioning below —
-- same table shape, automated partition management, continuous aggregates.

CREATE TABLE sensor_telemetry (
    telemetry_id         BIGSERIAL,
    sensor_id             UUID NOT NULL REFERENCES sensors(sensor_id) ON DELETE CASCADE,

    -- Denormalized point location (copied from sensors.install_geom at
    -- insert time). This lets you spatially query telemetry directly
    -- without a join, and tolerates sensors that report GPS drift.
    geom                   GEOMETRY(POINT, 4326) NOT NULL,

    soil_moisture_pct       NUMERIC(5,2) CHECK (soil_moisture_pct BETWEEN 0 AND 100),
    tilt_angle_deg           NUMERIC(6,3) CHECK (tilt_angle_deg BETWEEN -90 AND 90),
    pore_water_pressure_kpa   NUMERIC(8,3),
    rainfall_mm               NUMERIC(6,2),
    vibration_g                NUMERIC(6,3),
    battery_voltage             NUMERIC(4,2),

    is_anomalous                BOOLEAN NOT NULL DEFAULT FALSE,
    recorded_at                  TIMESTAMPTZ NOT NULL,
    ingested_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (telemetry_id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Example partitions — create programmatically (cron/pg_partman) in production
CREATE TABLE sensor_telemetry_2026_08 PARTITION OF sensor_telemetry
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE sensor_telemetry_2026_09 PARTITION OF sensor_telemetry
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- Indexes are defined on the parent and propagate to each partition
CREATE INDEX idx_telemetry_geom ON sensor_telemetry USING GIST (geom);
CREATE INDEX idx_telemetry_sensor_time ON sensor_telemetry (sensor_id, recorded_at DESC);
CREATE INDEX idx_telemetry_recorded_at_brin ON sensor_telemetry USING BRIN (recorded_at) WITH (pages_per_range = 32);
CREATE INDEX idx_telemetry_anomalous ON sensor_telemetry (recorded_at) WHERE is_anomalous = TRUE;

-- Helper: recommended monthly partition creation function
CREATE OR REPLACE FUNCTION create_telemetry_partition(target_month DATE)
RETURNS VOID AS $$
DECLARE
    partition_name TEXT := 'sensor_telemetry_' || to_char(target_month, 'YYYY_MM');
    start_date TEXT := to_char(target_month, 'YYYY-MM-01');
    end_date   TEXT := to_char(target_month + INTERVAL '1 month', 'YYYY-MM-01');
BEGIN
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF sensor_telemetry FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
    );
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 6. CITIZEN REPORTS  (Point data, crowdsourced)
-- ============================================================================

CREATE TABLE citizen_reports (
    report_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_name          VARCHAR(150),
    reporter_contact        VARCHAR(50),           -- phone/email, app-side validation
    reporter_user_id          UUID,                -- FK into an app Users table if present

    geom                     GEOMETRY(POINT, 4326) NOT NULL,
    nearest_risk_zone_id       UUID REFERENCES risk_zones(risk_zone_id) ON DELETE SET NULL,

    description                TEXT NOT NULL,
    self_reported_severity       report_severity_enum,
    photo_urls                    TEXT[],           -- array of object-storage URLs
    status                          report_status_enum NOT NULL DEFAULT 'PENDING',

    verified_by                     VARCHAR(150),
    verified_at                       TIMESTAMPTZ,
    verification_notes                 TEXT,

    reported_at                          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at                             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER citizen_reports_set_updated_at
BEFORE UPDATE ON citizen_reports
FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE INDEX idx_reports_geom ON citizen_reports USING GIST (geom);
CREATE INDEX idx_reports_status ON citizen_reports (status) WHERE status IN ('PENDING', 'UNDER_REVIEW');
CREATE INDEX idx_reports_reported_at ON citizen_reports USING BRIN (reported_at);
CREATE INDEX idx_reports_zone ON citizen_reports (nearest_risk_zone_id);
CREATE INDEX idx_reports_desc_trgm ON citizen_reports USING GIN (description gin_trgm_ops);

-- Auto-attach the nearest risk zone on insert (nearest within 5 km)
CREATE OR REPLACE FUNCTION trg_report_attach_zone()
RETURNS TRIGGER AS $$
BEGIN
    SELECT rz.risk_zone_id INTO NEW.nearest_risk_zone_id
    FROM risk_zones rz
    WHERE ST_DWithin(rz.geom::geography, NEW.geom::geography, 5000)
    ORDER BY rz.geom <-> NEW.geom   -- KNN index-assisted nearest-neighbour
    LIMIT 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER citizen_reports_attach_zone
BEFORE INSERT ON citizen_reports
FOR EACH ROW EXECUTE FUNCTION trg_report_attach_zone();


-- ============================================================================
-- 7. REAL-TIME QUERY PATTERNS (reference examples for the Node/TS backend)
-- ============================================================================

-- (a) Latest reading per active sensor inside a HIGH/CRITICAL zone
-- Uses DISTINCT ON + the (sensor_id, recorded_at DESC) index — no full scan.
--
-- SELECT DISTINCT ON (t.sensor_id) t.*
-- FROM sensor_telemetry t
-- JOIN sensors s ON s.sensor_id = t.sensor_id
-- JOIN risk_zones rz ON rz.risk_zone_id = s.risk_zone_id
-- WHERE rz.risk_level IN ('HIGH', 'CRITICAL')
--   AND t.recorded_at > now() - INTERVAL '15 minutes'
-- ORDER BY t.sensor_id, t.recorded_at DESC;

-- (b) All telemetry points inside a given polygon (dashboard map viewport)
-- ST_Intersects short-circuits using the GIST index before the exact check.
--
-- SELECT * FROM sensor_telemetry
-- WHERE ST_Intersects(geom, ST_MakeEnvelope(:minLon, :minLat, :maxLon, :maxLat, 4326))
--   AND recorded_at > now() - INTERVAL '1 hour';

-- (c) Citizen reports within 2 km of a sensor that just crossed a threshold
--
-- SELECT * FROM citizen_reports
-- WHERE ST_DWithin(geom::geography, :sensorPoint::geography, 2000)
--   AND status = 'PENDING'
-- ORDER BY reported_at DESC;

-- (d) Which risk zone contains an arbitrary lat/lon (point-in-polygon)
--
-- SELECT risk_zone_id, zone_name, risk_level
-- FROM risk_zones
-- WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326));


-- ============================================================================
-- 8. OPERATIONAL NOTES
-- ============================================================================
-- 1. geometry vs geography:
--    Columns are declared GEOMETRY(…, 4326) for fast index performance on
--    ST_Contains/ST_Intersects (planar math, cheaper). Distance-sensitive
--    checks (ST_DWithin, ST_Area for real-world meters) explicitly cast to
--    ::geography, which is the standard PostGIS pattern for accuracy without
--    paying geography's higher index cost everywhere.
--
-- 2. Partition maintenance:
--    Schedule create_telemetry_partition() via pg_cron or an app-level cron
--    job a month ahead of need. Drop/detach partitions older than your
--    retention window (e.g. DETACH + archive to cold storage/S3 after 12mo).
--
-- 3. Write throughput:
--    For very high ingest rates (>1000 rows/sec), batch inserts via
--    COPY or multi-row INSERT from the Node.js layer rather than one
--    INSERT per reading, and consider UNLOGGED staging tables + periodic
--    upsert if telemetry loss on crash is tolerable.
--
-- 4. Real-time push to clients:
--    Use PostgreSQL LISTEN/NOTIFY (or logical replication into a message
--    queue) triggered from sensor_telemetry inserts to push live updates to
--    the Node.js WebSocket layer instead of polling.
--
-- 5. Index maintenance:
--    Periodically CLUSTER risk_zones USING idx_risk_zones_geom; (low churn
--    table) to improve spatial locality. Not recommended for the
--    high-write telemetry table.
--
-- 6. Row-level security:
--    If citizen reporters authenticate via the app, consider RLS policies
--    on citizen_reports scoped to reporter_user_id for update/delete.
-- ============================================================================
