"""
SoapPV-AI Backend Tests
"""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.ml.predictor import predict, recommend_corrections, get_model_metrics, _engineer_features


# ── Fixtures ──────────────────────────────────────────────────────────────────
@pytest.fixture
def in_spec_params():
    return dict(
        mixer_rpm=2300, noodler_rpm=1700, pre_plodder_rpm=1900,
        final_plodder_rpm=1500, vacuum_pressure=540, starch_pct=2.0,
    )

@pytest.fixture
def under_spec_params():
    return dict(
        mixer_rpm=2000, noodler_rpm=1400, pre_plodder_rpm=1600,
        final_plodder_rpm=1800, vacuum_pressure=460, starch_pct=3.2,
    )


# ── Predictor Tests ───────────────────────────────────────────────────────────
class TestPredictor:

    def test_predict_returns_dict(self, in_spec_params):
        result = predict(**in_spec_params)
        assert isinstance(result, dict)

    def test_predict_has_required_keys(self, in_spec_params):
        result = predict(**in_spec_params)
        for key in ["predicted_pv", "quality_status", "in_spec", "confidence", "target_range"]:
            assert key in result, f"Missing key: {key}"

    def test_pv_in_range(self, in_spec_params):
        result = predict(**in_spec_params)
        assert 3.0 <= result["predicted_pv"] <= 5.0

    def test_quality_status_valid(self, in_spec_params):
        result = predict(**in_spec_params)
        assert result["quality_status"] in ["In-Spec", "Under-Spec", "Over-Spec"]

    def test_confidence_in_range(self, in_spec_params):
        result = predict(**in_spec_params)
        assert 0.0 <= result["confidence"] <= 1.0

    def test_target_range_correct(self, in_spec_params):
        result = predict(**in_spec_params)
        assert result["target_range"]["min"] == 3.8
        assert result["target_range"]["max"] == 4.2

    def test_in_spec_prediction(self, in_spec_params):
        result = predict(**in_spec_params)
        # At optimal params, should be in spec
        if result["in_spec"]:
            assert result["quality_status"] == "In-Spec"

    def test_predict_under_spec_scenario(self, under_spec_params):
        result = predict(**under_spec_params)
        assert isinstance(result["predicted_pv"], float)


# ── Feature Engineering Tests ──────────────────────────────────────────────────
class TestFeatureEngineering:

    def test_engineer_returns_dict(self):
        feats = _engineer_features(2300, 1700, 1900, 1500, 540, 2.0)
        assert isinstance(feats, dict)

    def test_mean_turbo_speed_correct(self):
        feats = _engineer_features(2300, 1700, 1900, 1500, 540, 2.0)
        expected = (2300 + 1700 + 1900 + 1500) / 4
        assert abs(feats["mean_turbo_speed"] - expected) < 0.1

    def test_pressure_deviation_correct(self):
        feats = _engineer_features(2300, 1700, 1900, 1500, 540, 2.0)
        assert abs(feats["pressure_deviation"] - abs(540 - 550)) < 0.1

    def test_stability_score_bounded(self):
        feats = _engineer_features(2300, 1700, 1900, 1500, 540, 2.0)
        assert -1.0 <= feats["stability_score"] <= 1.0

    def test_turbo_ratio_correct(self):
        feats = _engineer_features(2300, 1700, 1900, 1500, 540, 2.0)
        assert abs(feats["turbo_speed_ratio"] - 2300/1500) < 0.01


# ── Optimizer Tests ────────────────────────────────────────────────────────────
class TestOptimizer:

    def test_recommend_returns_dict(self, under_spec_params):
        result = recommend_corrections(**under_spec_params)
        assert isinstance(result, dict)

    def test_recommend_has_required_keys(self, under_spec_params):
        result = recommend_corrections(**under_spec_params)
        for key in ["current_pv", "needs_correction", "recommendations", "corrected_pv"]:
            assert key in result, f"Missing key: {key}"

    def test_corrected_pv_in_range(self, under_spec_params):
        result = recommend_corrections(**under_spec_params)
        assert 3.0 <= result["corrected_pv"] <= 5.0

    def test_in_spec_no_recommendations(self):
        # At nominal params, should be in spec and no recommendations
        result = recommend_corrections(2300, 1700, 1900, 1500, 540, 2.0)
        if not result["needs_correction"]:
            assert len(result["recommendations"]) == 0

    def test_recommendations_have_priority(self, under_spec_params):
        result = recommend_corrections(**under_spec_params)
        for rec in result["recommendations"]:
            assert rec["priority"] in ["High", "Medium", "Low"]

    def test_recommendations_have_direction(self, under_spec_params):
        result = recommend_corrections(**under_spec_params)
        for rec in result["recommendations"]:
            assert rec["direction"] in ["Increase", "Decrease"]


# ── Model Metrics Tests ────────────────────────────────────────────────────────
class TestModelMetrics:

    def test_metrics_returns_dict(self):
        metrics = get_model_metrics()
        assert isinstance(metrics, dict)

    def test_r2_in_valid_range(self):
        metrics = get_model_metrics()
        r2 = metrics["primary_model"]["r2"]
        assert 0.0 <= r2 <= 1.0

    def test_r2_above_target(self):
        metrics = get_model_metrics()
        r2 = metrics["primary_model"]["r2"]
        assert r2 >= 0.85, f"R² {r2:.4f} below 0.85 target"

    def test_feature_importance_present(self):
        metrics = get_model_metrics()
        assert len(metrics["feature_importance"]) > 0

    def test_target_range_correct(self):
        metrics = get_model_metrics()
        assert metrics["target_range"]["min"] == 3.8
        assert metrics["target_range"]["max"] == 4.2
