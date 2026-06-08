"""
SoapPV-AI: FastAPI Backend Application
Penetration Value Prediction & Process Optimization System
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import numpy as np
import logging
from datetime import datetime
from typing import List

from app.schemas.schemas import (
    ProcessInput, BatchInput,
    PredictionResponse, OptimizationResponse, ExplainResponse,
    ModelMetricsResponse, BatchAnalysisResponse, BatchPredictionResult,
    HealthResponse, RecommendationItem,
)
from app.ml.predictor import (
    predict, recommend_corrections, explain_prediction,
    get_model_metrics, ModelStore,
)
from app.core.config import settings

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("soappv")

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="SoapPV-AI API",
    description="Penetration Value Prediction & Process Optimization System for Soap Manufacturing",
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Startup: pre-warm model ────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    logger.info("Loading ML model...")
    store = ModelStore.get()
    logger.info(f"Model loaded — version {store.metrics.get('model_version', 'unknown')}")


# ── Health ─────────────────────────────────────────────────────────────────────
@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health():
    store = ModelStore.get()
    return HealthResponse(
        status="healthy",
        model_loaded=store.model is not None,
        model_version=store.metrics.get("model_version", "unknown"),
        app_version=settings.APP_VERSION,
    )


# ── Predict ────────────────────────────────────────────────────────────────────
@app.post("/predict", response_model=PredictionResponse, tags=["Prediction"])
async def predict_pv(data: ProcessInput):
    """
    Predict Penetration Value (PV) from manufacturing process parameters.
    
    Returns:
    - predicted_pv: Predicted penetration value
    - quality_status: In-Spec / Under-Spec / Over-Spec
    - confidence: Prediction confidence score
    - target_range: Target PV range (3.8 – 4.2)
    """
    try:
        result = predict(
            mixer_rpm=data.mixer_turbo_speed_rpm,
            noodler_rpm=data.noodler_turbo_speed_rpm,
            pre_plodder_rpm=data.pre_plodder_turbo_speed_rpm,
            final_plodder_rpm=data.final_plodder_turbo_speed_rpm,
            vacuum_pressure=data.vacuum_chamber_pressure_mmhg,
            starch_pct=data.starch_percentage,
            ambient_temp=data.ambient_temperature_c,
            ambient_humidity=data.ambient_humidity_pct,
            coolant_temp=data.coolant_temp_c,
            machine_status=data.machine_status,
            shift=data.shift,
        )
        return PredictionResponse(
            predicted_pv=result["predicted_pv"],
            quality_status=result["quality_status"],
            in_spec=result["in_spec"],
            confidence=result["confidence"],
            target_range=result["target_range"],
            deviation=result["deviation"],
            batch_id=data.batch_id,
        )
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Recommend ──────────────────────────────────────────────────────────────────
@app.post("/recommend", response_model=OptimizationResponse, tags=["Optimization"])
async def recommend(data: ProcessInput):
    """
    Recommend process parameter corrections when predicted PV is out of spec.
    
    Uses stochastic perturbation search to find optimal parameter adjustments.
    Returns human-readable recommendations with priority levels.
    """
    try:
        result = recommend_corrections(
            mixer_rpm=data.mixer_turbo_speed_rpm,
            noodler_rpm=data.noodler_turbo_speed_rpm,
            pre_plodder_rpm=data.pre_plodder_turbo_speed_rpm,
            final_plodder_rpm=data.final_plodder_turbo_speed_rpm,
            vacuum_pressure=data.vacuum_chamber_pressure_mmhg,
            starch_pct=data.starch_percentage,
            ambient_temp=data.ambient_temperature_c,
            ambient_humidity=data.ambient_humidity_pct,
            coolant_temp=data.coolant_temp_c,
            machine_status=data.machine_status,
            shift=data.shift,
        )
        recs = [RecommendationItem(**r) for r in result["recommendations"]]
        return OptimizationResponse(
            current_pv=result["current_pv"],
            current_status=result.get("current_status", result.get("status", "Unknown")),
            needs_correction=result["needs_correction"],
            recommendations=recs,
            optimized_params=result.get("optimized_params"),
            corrected_pv=result["corrected_pv"],
            improvement=result["improvement"],
        )
    except Exception as e:
        logger.error(f"Recommend error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Explain ────────────────────────────────────────────────────────────────────
@app.post("/explain", response_model=ExplainResponse, tags=["Explainability"])
async def explain(data: ProcessInput):
    """
    SHAP-based explanation of prediction.
    
    Returns:
    - SHAP values per feature
    - Feature importance (global)
    - Sensitivity analysis
    - Top contributing drivers
    """
    try:
        result = explain_prediction(
            mixer_rpm=data.mixer_turbo_speed_rpm,
            noodler_rpm=data.noodler_turbo_speed_rpm,
            pre_plodder_rpm=data.pre_plodder_turbo_speed_rpm,
            final_plodder_rpm=data.final_plodder_turbo_speed_rpm,
            vacuum_pressure=data.vacuum_chamber_pressure_mmhg,
            starch_pct=data.starch_percentage,
            ambient_temp=data.ambient_temperature_c,
            ambient_humidity=data.ambient_humidity_pct,
            coolant_temp=data.coolant_temp_c,
            machine_status=data.machine_status,
            shift=data.shift,
        )
        return ExplainResponse(**result)
    except Exception as e:
        logger.error(f"Explain error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Model Metrics ──────────────────────────────────────────────────────────────
@app.get("/model-metrics", response_model=ModelMetricsResponse, tags=["Analytics"])
async def model_metrics():
    """
    Return comprehensive model performance metrics, feature importance,
    SHAP summary, and error analysis.
    """
    try:
        return ModelMetricsResponse(**get_model_metrics())
    except Exception as e:
        logger.error(f"Metrics error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Batch Analysis ─────────────────────────────────────────────────────────────
@app.post("/batch-analysis", response_model=BatchAnalysisResponse, tags=["Analytics"])
async def batch_analysis(data: BatchInput):
    """
    Run predictions on a batch of process records.
    Returns aggregate statistics and per-record results.
    """
    try:
        results = []
        pv_values = []

        for rec in data.records:
            res = predict(
                mixer_rpm=rec.mixer_turbo_speed_rpm,
                noodler_rpm=rec.noodler_turbo_speed_rpm,
                pre_plodder_rpm=rec.pre_plodder_turbo_speed_rpm,
                final_plodder_rpm=rec.final_plodder_turbo_speed_rpm,
                vacuum_pressure=rec.vacuum_chamber_pressure_mmhg,
                starch_pct=rec.starch_percentage,
                ambient_temp=rec.ambient_temperature_c,
                ambient_humidity=rec.ambient_humidity_pct,
                coolant_temp=rec.coolant_temp_c,
                machine_status=rec.machine_status,
                shift=rec.shift,
            )
            pv_values.append(res["predicted_pv"])
            results.append(BatchPredictionResult(
                batch_id=rec.batch_id,
                predicted_pv=res["predicted_pv"],
                quality_status=res["quality_status"],
                in_spec=res["in_spec"],
            ))

        pv_arr = np.array(pv_values)
        in_spec_mask = (pv_arr >= 3.8) & (pv_arr <= 4.2)

        return BatchAnalysisResponse(
            total_records=len(results),
            in_spec_count=int(in_spec_mask.sum()),
            out_of_spec_count=int((~in_spec_mask).sum()),
            in_spec_pct=round(float(in_spec_mask.mean()) * 100, 2),
            mean_pv=round(float(pv_arr.mean()), 3),
            std_pv=round(float(pv_arr.std()), 3),
            min_pv=round(float(pv_arr.min()), 3),
            max_pv=round(float(pv_arr.max()), 3),
            results=results,
        )
    except Exception as e:
        logger.error(f"Batch analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Historical Trends (mock for frontend) ─────────────────────────────────────
@app.get("/historical-trends", tags=["Analytics"])
async def historical_trends(hours: int = 24):
    """Return historical PV trend data (last N hours) from dataset."""
    try:
        import pandas as pd
        df = pd.read_csv("data/soap_manufacturing_data.csv")
        df = df.tail(hours * 4)  # ~15-min intervals
        trend = df[["timestamp", "penetration_value", "quality_status"]].to_dict("records")
        return {"hours": hours, "data": trend}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Quick Stats ────────────────────────────────────────────────────────────────
@app.get("/stats", tags=["Analytics"])
async def quick_stats():
    """Dashboard summary statistics."""
    try:
        import pandas as pd
        df = pd.read_csv("data/soap_manufacturing_data.csv")
        last_100 = df.tail(100)
        qs = last_100["quality_status"].value_counts().to_dict()
        return {
            "total_records":    len(df),
            "last_100": {
                "in_spec_pct":   round(qs.get("In-Spec", 0) / 100 * 100, 1),
                "mean_pv":       round(last_100["penetration_value"].mean(), 3),
                "quality_dist":  qs,
            },
            "overall": {
                "in_spec_pct":   round((df["quality_status"] == "In-Spec").mean() * 100, 1),
                "mean_pv":       round(df["penetration_value"].mean(), 3),
                "std_pv":        round(df["penetration_value"].std(), 3),
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
