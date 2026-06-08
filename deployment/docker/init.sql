-- SoapPV-AI Database Schema

-- Predictions table
CREATE TABLE IF NOT EXISTS predictions (
    id              SERIAL PRIMARY KEY,
    batch_id        VARCHAR(50),
    predicted_pv    DECIMAL(6,3)    NOT NULL,
    quality_status  VARCHAR(20)     NOT NULL,
    in_spec         BOOLEAN         NOT NULL,
    confidence      DECIMAL(5,3),
    mixer_rpm       DECIMAL(8,1),
    noodler_rpm     DECIMAL(8,1),
    pre_plodder_rpm DECIMAL(8,1),
    final_plodder_rpm DECIMAL(8,1),
    vacuum_pressure DECIMAL(8,1),
    starch_pct      DECIMAL(5,3),
    machine_status  VARCHAR(20)     DEFAULT 'Normal',
    shift           VARCHAR(20)     DEFAULT 'Morning',
    created_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- Optimizations / recommendations table
CREATE TABLE IF NOT EXISTS optimizations (
    id              SERIAL PRIMARY KEY,
    prediction_id   INT             REFERENCES predictions(id),
    current_pv      DECIMAL(6,3)    NOT NULL,
    corrected_pv    DECIMAL(6,3),
    improvement     DECIMAL(6,3),
    recommendations JSONB,
    optimized_params JSONB,
    created_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- Production batches table
CREATE TABLE IF NOT EXISTS production_batches (
    id              SERIAL PRIMARY KEY,
    batch_id        VARCHAR(50)     UNIQUE NOT NULL,
    shift           VARCHAR(20),
    machine_status  VARCHAR(20),
    actual_pv       DECIMAL(6,3),
    predicted_pv    DECIMAL(6,3),
    quality_status  VARCHAR(20),
    created_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- Model results table
CREATE TABLE IF NOT EXISTS model_results (
    id              SERIAL PRIMARY KEY,
    model_version   VARCHAR(20)     NOT NULL,
    r2_score        DECIMAL(8,6),
    rmse            DECIMAL(8,6),
    mae             DECIMAL(8,6),
    trained_at      TIMESTAMPTZ,
    dataset_size    INT,
    feature_count   INT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ     DEFAULT NOW()
);

-- Historical trends (aggregated)
CREATE TABLE IF NOT EXISTS pv_trends (
    id              SERIAL PRIMARY KEY,
    recorded_at     TIMESTAMPTZ     NOT NULL,
    mean_pv         DECIMAL(6,3),
    min_pv          DECIMAL(6,3),
    max_pv          DECIMAL(6,3),
    in_spec_pct     DECIMAL(5,2),
    batch_count     INT,
    shift           VARCHAR(20)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_predictions_created    ON predictions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_batch      ON predictions(batch_id);
CREATE INDEX IF NOT EXISTS idx_predictions_quality    ON predictions(quality_status);
CREATE INDEX IF NOT EXISTS idx_pv_trends_recorded     ON pv_trends(recorded_at DESC);

-- Initial model result record
INSERT INTO model_results (model_version, r2_score, rmse, mae, trained_at, dataset_size, feature_count)
VALUES ('1.0.0', 0.9105, 0.0485, 0.0386, NOW(), 22000, 32)
ON CONFLICT DO NOTHING;
