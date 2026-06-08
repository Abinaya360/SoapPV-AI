"""
SoapPV-AI: Pydantic Schemas for API validation
"""
from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime


# ── Input schemas ──────────────────────────────────────────────────────────────
class ProcessInput(BaseModel):
    mixer_turbo_speed_rpm:         float = Field(..., ge=1800, le=2800,  description="Mixer turbo speed (RPM)")
    noodler_turbo_speed_rpm:       float = Field(..., ge=1200, le=2200,  description="Noodler turbo speed (RPM)")
    pre_plodder_turbo_speed_rpm:   float = Field(..., ge=1400, le=2400,  description="Pre-plodder turbo speed (RPM)")
    final_plodder_turbo_speed_rpm: float = Field(..., ge=1000, le=2000,  description="Final plodder turbo speed (RPM)")
    vacuum_chamber_pressure_mmhg:  float = Field(..., ge=400,  le=700,   description="Vacuum chamber pressure (mmHg)")
    starch_percentage:             float = Field(..., ge=0.5,  le=4.0,   description="Starch percentage (%)")
    ambient_temperature_c:         float = Field(28.0, ge=18,  le=45,    description="Ambient temperature (°C)")
    ambient_humidity_pct:          float = Field(62.0, ge=30,  le=95,    description="Ambient humidity (%)")
    coolant_temp_c:                float = Field(18.0, ge=10,  le=30,    description="Coolant temperature (°C)")
    machine_status:                str   = Field("Normal",               description="Machine status")
    shift:                         str   = Field("Morning",              description="Production shift")
    batch_id:                      Optional[str] = None

    @validator("machine_status")
    def validate_machine_status(cls, v):
        allowed = ["Normal", "Degraded", "Maintenance"]
        if v not in allowed:
            raise ValueError(f"machine_status must be one of {allowed}")
        return v

    @validator("shift")
    def validate_shift(cls, v):
        allowed = ["Morning", "Afternoon", "Night"]
        if v not in allowed:
            raise ValueError(f"shift must be one of {allowed}")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "mixer_turbo_speed_rpm":         2300.0,
                "noodler_turbo_speed_rpm":       1700.0,
                "pre_plodder_turbo_speed_rpm":   1900.0,
                "final_plodder_turbo_speed_rpm": 1500.0,
                "vacuum_chamber_pressure_mmhg":  540.0,
                "starch_percentage":             2.0,
                "machine_status":                "Normal",
                "shift":                         "Morning",
            }
        }


class BatchInput(BaseModel):
    records: List[ProcessInput] = Field(..., min_items=1, max_items=1000)


# ── Output schemas ─────────────────────────────────────────────────────────────
class PredictionResponse(BaseModel):
    predicted_pv:    float
    quality_status:  str
    in_spec:         bool
    confidence:      float
    target_range:    Dict[str, float]
    deviation:       float
    batch_id:        Optional[str] = None
    timestamp:       datetime = Field(default_factory=datetime.now)


class RecommendationItem(BaseModel):
    parameter:          str
    unit:               str
    current_value:      float
    recommended_value:  float
    delta:              float
    direction:          str
    priority:           str
    reason:             str


class OptimizationResponse(BaseModel):
    current_pv:        float
    current_status:    str
    needs_correction:  bool
    recommendations:   List[RecommendationItem]
    optimized_params:  Optional[Dict[str, float]] = None
    corrected_pv:      float
    improvement:       float
    timestamp:         datetime = Field(default_factory=datetime.now)


class ExplainResponse(BaseModel):
    predicted_pv:        float
    shap_values:         Dict[str, float]
    feature_importance:  Dict[str, float]
    top_drivers:         List[str]
    sensitivity:         Dict[str, float]


class ModelMetricsResponse(BaseModel):
    model_version:    str
    trained_at:       Optional[str]
    dataset_size:     Optional[int]
    primary_model:    Dict[str, Any]
    cv_scores:        Dict[str, Any]
    baseline_models:  List[Dict[str, Any]]
    feature_importance: Dict[str, float]
    shap_importance:  Dict[str, float]
    error_analysis:   Dict[str, float]
    sensitivity:      Dict[str, float]
    target_range:     Dict[str, float]


class BatchPredictionResult(BaseModel):
    batch_id:       Optional[str]
    predicted_pv:   float
    quality_status: str
    in_spec:        bool


class BatchAnalysisResponse(BaseModel):
    total_records:      int
    in_spec_count:      int
    out_of_spec_count:  int
    in_spec_pct:        float
    mean_pv:            float
    std_pv:             float
    min_pv:             float
    max_pv:             float
    results:            List[BatchPredictionResult]


class HealthResponse(BaseModel):
    status:          str
    model_loaded:    bool
    model_version:   str
    app_version:     str
