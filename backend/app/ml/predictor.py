"""
SoapPV-AI: ML Predictor, Optimizer, and Explainer
Core inference engine for the FastAPI backend.
"""

import os
import json
import joblib
import shap
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from functools import lru_cache
import warnings

warnings.filterwarnings("ignore")

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
ART_DIR   = os.path.join(BASE_DIR, "artifacts")

# ── Operational ranges for optimization ───────────────────────────────────────
PARAM_RANGES = {
    "mixer_turbo_speed_rpm":         (1800, 2800),
    "noodler_turbo_speed_rpm":       (1200, 2200),
    "pre_plodder_turbo_speed_rpm":   (1400, 2400),
    "final_plodder_turbo_speed_rpm": (1000, 2000),
    "vacuum_chamber_pressure_mmhg":  (400, 700),
    "starch_percentage":             (0.5, 4.0),
}

TARGET_MIN = 3.8
TARGET_MAX = 4.2
OPTIMAL_VP = 550.0   # mmHg


# ── Singleton loader ───────────────────────────────────────────────────────────
class ModelStore:
    _instance = None
    model = None
    feature_names: List[str] = []
    metrics: Dict = {}
    explainer = None

    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls()
            cls._instance._load()
        return cls._instance

    def _load(self):
        self.model        = joblib.load(f"{ART_DIR}/xgboost_model.pkl")
        self.feature_names = joblib.load(f"{ART_DIR}/feature_names.pkl")
        with open(f"{ART_DIR}/model_metrics.json") as f:
            self.metrics = json.load(f)
        try:
            self.explainer = shap.TreeExplainer(self.model)
        except Exception:
            self.explainer = None


# ── Feature engineering (must match training) ──────────────────────────────────
def _engineer_features(
    mixer_rpm: float,
    noodler_rpm: float,
    pre_plodder_rpm: float,
    final_plodder_rpm: float,
    vacuum_pressure: float,
    starch_pct: float,
    ambient_temp: float = 28.0,
    ambient_humidity: float = 62.0,
    coolant_temp: float = 18.0,
    machine_status: str = "Normal",
    shift: str = "Morning",
) -> Dict[str, float]:
    turbo_speeds = [mixer_rpm, noodler_rpm, pre_plodder_rpm, final_plodder_rpm]
    mean_ts    = np.mean(turbo_speeds)
    std_ts     = np.std(turbo_speeds)
    ratio_ts   = mixer_rpm / final_plodder_rpm
    pressure_dev = abs(vacuum_pressure - 550)
    load_idx   = mean_ts * starch_pct / 100
    mech_e     = 0.25*mixer_rpm + 0.20*noodler_rpm + 0.25*pre_plodder_rpm + 0.30*final_plodder_rpm
    stability  = 1 - std_ts / mean_ts if mean_ts > 0 else 0
    mx_fp_int  = mixer_rpm * final_plodder_rpm / 1e6
    vp_sx_int  = vacuum_pressure * starch_pct / 1000
    pp_fp_r    = pre_plodder_rpm / final_plodder_rpm
    e_vac_int  = mech_e * vacuum_pressure / 1e6
    ms_enc     = {"Normal": 0, "Degraded": 1, "Maintenance": 2}.get(machine_status, 0)
    sh_enc     = {"Morning": 0, "Afternoon": 1, "Night": 2}.get(shift, 0)

    # Polynomial
    vp_sq   = (vacuum_pressure / 550) ** 2
    fp_sq   = (final_plodder_rpm / 1500) ** 2
    mx_sq   = (mixer_rpm / 2300) ** 2
    sx_sq   = starch_pct ** 2
    vp_fp   = vacuum_pressure * final_plodder_rpm / 1e6
    mx_sx   = mixer_rpm * starch_pct / 1000
    pp_fp_x = pre_plodder_rpm * final_plodder_rpm / 1e6
    vp_sx_x = vacuum_pressure * starch_pct / 100
    log_m   = np.log1p(mech_e)
    vp_dev_sq = pressure_dev ** 2

    return {
        "mixer_turbo_speed_rpm":         mixer_rpm,
        "noodler_turbo_speed_rpm":       noodler_rpm,
        "pre_plodder_turbo_speed_rpm":   pre_plodder_rpm,
        "final_plodder_turbo_speed_rpm": final_plodder_rpm,
        "vacuum_chamber_pressure_mmhg":  vacuum_pressure,
        "starch_percentage":             starch_pct,
        "ambient_temperature_c":         ambient_temp,
        "ambient_humidity_pct":          ambient_humidity,
        "coolant_temp_c":                coolant_temp,
        "mean_turbo_speed":              round(mean_ts, 2),
        "turbo_speed_std":               round(std_ts, 2),
        "turbo_speed_ratio":             round(ratio_ts, 4),
        "pressure_deviation":            round(pressure_dev, 2),
        "process_load_index":            round(load_idx, 4),
        "mechanical_energy_index":       round(mech_e, 2),
        "stability_score":               round(stability, 4),
        "mixer_final_interaction":       round(mx_fp_int, 4),
        "vacuum_starch_interaction":     round(vp_sx_int, 4),
        "plodder_ratio":                 round(pp_fp_r, 4),
        "energy_vacuum_interaction":     round(e_vac_int, 6),
        "machine_status_encoded":        ms_enc,
        "shift_encoded":                 sh_enc,
        "vp_sq":  round(vp_sq, 4),
        "fp_sq":  round(fp_sq, 4),
        "mx_sq":  round(mx_sq, 4),
        "sx_sq":  round(sx_sq, 4),
        "vp_fp":  round(vp_fp, 4),
        "mx_sx":  round(mx_sx, 4),
        "pp_fp":  round(pp_fp_x, 4),
        "vp_sx":  round(vp_sx_x, 4),
        "log_mech": round(log_m, 4),
        "vp_dev_sq": round(vp_dev_sq, 2),
    }


# ── Predictor ─────────────────────────────────────────────────────────────────
def predict(
    mixer_rpm: float,
    noodler_rpm: float,
    pre_plodder_rpm: float,
    final_plodder_rpm: float,
    vacuum_pressure: float,
    starch_pct: float,
    ambient_temp: float = 28.0,
    ambient_humidity: float = 62.0,
    coolant_temp: float = 18.0,
    machine_status: str = "Normal",
    shift: str = "Morning",
) -> Dict:
    store = ModelStore.get()
    feats = _engineer_features(
        mixer_rpm, noodler_rpm, pre_plodder_rpm, final_plodder_rpm,
        vacuum_pressure, starch_pct, ambient_temp, ambient_humidity,
        coolant_temp, machine_status, shift,
    )
    X = pd.DataFrame([feats])[store.feature_names]
    pv = float(store.model.predict(X)[0])
    pv = round(np.clip(pv, 3.0, 5.0), 3)

    # Confidence: prediction interval via leaf-level variance
    confidence = _estimate_confidence(store.model, X, pv)

    in_spec = TARGET_MIN <= pv <= TARGET_MAX
    status  = "In-Spec" if in_spec else ("Under-Spec" if pv < TARGET_MIN else "Over-Spec")

    return {
        "predicted_pv":    pv,
        "quality_status":  status,
        "in_spec":         in_spec,
        "confidence":      confidence,
        "target_range":    {"min": TARGET_MIN, "max": TARGET_MAX},
        "deviation":       round(abs(pv - ((TARGET_MIN + TARGET_MAX) / 2)), 3),
        "engineered_features": feats,
    }


def _estimate_confidence(model, X: pd.DataFrame, pv: float) -> float:
    """Estimate confidence based on PV proximity to target center and model RMSE."""
    center = (TARGET_MIN + TARGET_MAX) / 2
    rmse   = 0.0485  # from training
    dist   = abs(pv - center)
    conf   = max(0.50, min(0.99, 1.0 - (dist / 1.0) - (rmse * 2)))
    return round(conf, 3)


# ── Process Optimizer ─────────────────────────────────────────────────────────
def recommend_corrections(
    mixer_rpm: float,
    noodler_rpm: float,
    pre_plodder_rpm: float,
    final_plodder_rpm: float,
    vacuum_pressure: float,
    starch_pct: float,
    ambient_temp: float = 28.0,
    ambient_humidity: float = 62.0,
    coolant_temp: float = 18.0,
    machine_status: str = "Normal",
    shift: str = "Morning",
) -> Dict:
    store    = ModelStore.get()
    current  = predict(mixer_rpm, noodler_rpm, pre_plodder_rpm,
                       final_plodder_rpm, vacuum_pressure, starch_pct,
                       ambient_temp, ambient_humidity, coolant_temp,
                       machine_status, shift)
    pv       = current["predicted_pv"]
    status   = current["quality_status"]

    if current["in_spec"]:
        return {
            "current_pv":        pv,
            "status":            status,
            "needs_correction":  False,
            "recommendations":   [],
            "corrected_pv":      pv,
            "improvement":       0.0,
        }

    # ── Gradient-based parameter search ───────────────────────────────────────
    best_pv    = pv
    best_params = dict(
        mixer_rpm=mixer_rpm, noodler_rpm=noodler_rpm,
        pre_plodder_rpm=pre_plodder_rpm, final_plodder_rpm=final_plodder_rpm,
        vacuum_pressure=vacuum_pressure, starch_pct=starch_pct,
    )
    n_tries = 800
    rng = np.random.default_rng(0)

    for _ in range(n_tries):
        candidate = {
            "mixer_rpm":         _perturb(mixer_rpm,          PARAM_RANGES["mixer_turbo_speed_rpm"],         rng),
            "noodler_rpm":       _perturb(noodler_rpm,         PARAM_RANGES["noodler_turbo_speed_rpm"],       rng),
            "pre_plodder_rpm":   _perturb(pre_plodder_rpm,    PARAM_RANGES["pre_plodder_turbo_speed_rpm"],   rng),
            "final_plodder_rpm": _perturb(final_plodder_rpm,  PARAM_RANGES["final_plodder_turbo_speed_rpm"], rng),
            "vacuum_pressure":   _perturb(vacuum_pressure,    PARAM_RANGES["vacuum_chamber_pressure_mmhg"],  rng),
            "starch_pct":        starch_pct,  # starch not adjusted at runtime
        }
        cand_pv = _quick_predict(store, candidate, ambient_temp, ambient_humidity, coolant_temp, machine_status, shift)
        if TARGET_MIN <= cand_pv <= TARGET_MAX:
            dist_c = abs(cand_pv - (TARGET_MIN + TARGET_MAX) / 2)
            dist_b = abs(best_pv - (TARGET_MIN + TARGET_MAX) / 2)
            if not (TARGET_MIN <= best_pv <= TARGET_MAX) or dist_c < dist_b:
                best_pv     = cand_pv
                best_params = candidate

    # ── Build human-readable recommendations ──────────────────────────────────
    recs = _build_recommendations(
        original=dict(mixer_rpm=mixer_rpm, noodler_rpm=noodler_rpm,
                      pre_plodder_rpm=pre_plodder_rpm, final_plodder_rpm=final_plodder_rpm,
                      vacuum_pressure=vacuum_pressure, starch_pct=starch_pct),
        optimized=best_params,
        current_pv=pv,
        corrected_pv=best_pv,
    )

    return {
        "current_pv":       round(pv, 3),
        "current_status":   status,
        "needs_correction": True,
        "recommendations":  recs,
        "optimized_params": {
            "mixer_turbo_speed_rpm":         round(best_params["mixer_rpm"], 1),
            "noodler_turbo_speed_rpm":       round(best_params["noodler_rpm"], 1),
            "pre_plodder_turbo_speed_rpm":   round(best_params["pre_plodder_rpm"], 1),
            "final_plodder_turbo_speed_rpm": round(best_params["final_plodder_rpm"], 1),
            "vacuum_chamber_pressure_mmhg":  round(best_params["vacuum_pressure"], 1),
            "starch_percentage":             round(best_params["starch_pct"], 3),
        },
        "corrected_pv":     round(best_pv, 3),
        "improvement":      round(abs(pv - best_pv), 3),
    }


def _perturb(val: float, bounds: Tuple[float, float], rng, scale: float = 0.15) -> float:
    lo, hi   = bounds
    # Mix: 70% local perturbation, 30% global random sample across full range
    if rng.random() < 0.30:
        return float(rng.uniform(lo, hi))
    rng_size = (hi - lo) * scale
    new_val  = val + rng.uniform(-rng_size, rng_size)
    return float(np.clip(new_val, lo, hi))


def _quick_predict(store, params: Dict, at, ah, ct, ms, sh) -> float:
    feats = _engineer_features(
        params["mixer_rpm"], params["noodler_rpm"], params["pre_plodder_rpm"],
        params["final_plodder_rpm"], params["vacuum_pressure"], params["starch_pct"],
        at, ah, ct, ms, sh,
    )
    X  = pd.DataFrame([feats])[store.feature_names]
    pv = float(store.model.predict(X)[0])
    return float(np.clip(pv, 3.0, 5.0))


def _build_recommendations(original: Dict, optimized: Dict, current_pv: float, corrected_pv: float) -> List[Dict]:
    param_map = {
        "mixer_rpm":         ("Mixer Turbo Speed",         "RPM",  "mixer_turbo_speed_rpm"),
        "noodler_rpm":       ("Noodler Turbo Speed",       "RPM",  "noodler_turbo_speed_rpm"),
        "pre_plodder_rpm":   ("Pre-Plodder Turbo Speed",  "RPM",  "pre_plodder_turbo_speed_rpm"),
        "final_plodder_rpm": ("Final Plodder Turbo Speed","RPM",  "final_plodder_turbo_speed_rpm"),
        "vacuum_pressure":   ("Vacuum Chamber Pressure",  "mmHg", "vacuum_chamber_pressure_mmhg"),
        "starch_pct":        ("Starch Percentage",         "%",    "starch_percentage"),
    }
    recs = []
    for key, (label, unit, _) in param_map.items():
        orig = original[key]
        opt  = optimized.get(key, orig)
        delta = opt - orig
        if abs(delta) < 0.5:
            continue
        direction = "Increase" if delta > 0 else "Decrease"
        pct_change = abs(delta / orig) * 100
        priority = "High" if pct_change > 10 else ("Medium" if pct_change > 5 else "Low")
        recs.append({
            "parameter":     label,
            "unit":          unit,
            "current_value": round(orig, 1),
            "recommended_value": round(opt, 1),
            "delta":         round(delta, 1),
            "direction":     direction,
            "priority":      priority,
            "reason":        _reason(key, direction, current_pv),
        })
    # Sort by priority
    order = {"High": 0, "Medium": 1, "Low": 2}
    recs.sort(key=lambda x: order[x["priority"]])
    return recs


def _reason(key: str, direction: str, pv: float) -> str:
    under = pv < TARGET_MIN
    reasons = {
        "mixer_rpm":         f"{'Increasing' if direction=='Increase' else 'Decreasing'} mixer speed improves homogeneous mixing, {'softening' if under else 'hardening'} the soap bar.",
        "noodler_rpm":       f"Noodler speed adjustment refines the extruded noodles for {'better plasticity' if under else 'increased density'}.",
        "pre_plodder_rpm":   f"Pre-plodder speed controls initial compaction; {'increase' if under else 'reduce'} to {'build structure' if under else 'reduce over-compression'}.",
        "final_plodder_rpm": f"Final plodder directly sets bar density. {'Reduce' if not under else 'Increase'} to {'soften PV' if not under else 'raise PV'}.",
        "vacuum_pressure":   f"Vacuum at {OPTIMAL_VP} mmHg is optimal. {'Increase' if direction=='Increase' else 'Decrease'} to {'improve air removal and homogeneity' if direction=='Increase' else 'reduce over-densification'}.",
        "starch_pct":        f"Starch content affects water retention. Adjust to modify bar plasticity.",
    }
    return reasons.get(key, "Parameter adjustment recommended to bring PV into target range.")


# ── Explainer ─────────────────────────────────────────────────────────────────
def explain_prediction(
    mixer_rpm: float,
    noodler_rpm: float,
    pre_plodder_rpm: float,
    final_plodder_rpm: float,
    vacuum_pressure: float,
    starch_pct: float,
    **kwargs,
) -> Dict:
    store = ModelStore.get()
    feats = _engineer_features(
        mixer_rpm, noodler_rpm, pre_plodder_rpm, final_plodder_rpm,
        vacuum_pressure, starch_pct,
        kwargs.get("ambient_temp", 28.0),
        kwargs.get("ambient_humidity", 62.0),
        kwargs.get("coolant_temp", 18.0),
        kwargs.get("machine_status", "Normal"),
        kwargs.get("shift", "Morning"),
    )
    X = pd.DataFrame([feats])[store.feature_names]
    pv = float(store.model.predict(X)[0])

    shap_vals = {}
    if store.explainer:
        sv = store.explainer.shap_values(X)
        shap_vals = dict(zip(store.feature_names, sv[0].tolist()))
        shap_vals = dict(sorted(shap_vals.items(), key=lambda x: abs(x[1]), reverse=True))

    fi = store.metrics.get("feature_importance", {})

    return {
        "predicted_pv":          round(pv, 3),
        "shap_values":           shap_vals,
        "feature_importance":    fi,
        "top_drivers":           list(shap_vals.keys())[:6],
        "sensitivity":           store.metrics.get("sensitivity", {}),
    }


# ── Model Metrics endpoint helper ─────────────────────────────────────────────
def get_model_metrics() -> Dict:
    store = ModelStore.get()
    m = store.metrics
    return {
        "model_version":    m.get("model_version", "1.0.0"),
        "trained_at":       m.get("trained_at"),
        "dataset_size":     m.get("dataset_size"),
        "primary_model":    m.get("primary_model"),
        "cv_scores":        m.get("cv_scores"),
        "baseline_models":  m.get("baseline_models", []),
        "feature_importance": m.get("feature_importance", {}),
        "shap_importance":  m.get("shap_importance", {}),
        "error_analysis":   m.get("error_analysis", {}),
        "sensitivity":      m.get("sensitivity", {}),
        "target_range":     m.get("target_range"),
    }
