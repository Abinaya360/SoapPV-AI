"""
SoapPV-AI: ML Training Pipeline
XGBoost Regressor with hyperparameter tuning, cross-validation,
feature engineering, model comparison, and SHAP explainability.
Target: R² ≈ 0.87
"""

import os
import json
import joblib
import warnings
import numpy as np
import pandas as pd
from datetime import datetime

from sklearn.model_selection import train_test_split, KFold, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    mean_squared_error, mean_absolute_error, r2_score
)
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
import xgboost as xgb

warnings.filterwarnings("ignore")

# ── Paths ──────────────────────────────────────────────────────────────────────
DATA_PATH  = "data/soap_manufacturing_data.csv"
MODEL_DIR  = "backend/app/ml/artifacts"
os.makedirs(MODEL_DIR, exist_ok=True)

# ── Feature columns ────────────────────────────────────────────────────────────
FEATURE_COLS = [
    "mixer_turbo_speed_rpm",
    "noodler_turbo_speed_rpm",
    "pre_plodder_turbo_speed_rpm",
    "final_plodder_turbo_speed_rpm",
    "vacuum_chamber_pressure_mmhg",
    "starch_percentage",
    "ambient_temperature_c",
    "ambient_humidity_pct",
    "coolant_temp_c",
    "mean_turbo_speed",
    "turbo_speed_std",
    "turbo_speed_ratio",
    "pressure_deviation",
    "process_load_index",
    "mechanical_energy_index",
    "stability_score",
    "mixer_final_interaction",
    "vacuum_starch_interaction",
    "plodder_ratio",
    "energy_vacuum_interaction",
]

TARGET_COL = "penetration_value"


# ── Load & Prepare ─────────────────────────────────────────────────────────────
def load_data(path: str = DATA_PATH):
    df = pd.read_csv(path, parse_dates=["timestamp"])

    # Encode machine_status
    df["machine_status_encoded"] = df["machine_status"].map(
        {"Normal": 0, "Degraded": 1, "Maintenance": 2}
    ).fillna(0)

    df["shift_encoded"] = df["shift"].map(
        {"Morning": 0, "Afternoon": 1, "Night": 2}
    ).fillna(0)

    cols = FEATURE_COLS + ["machine_status_encoded", "shift_encoded"]
    X = df[cols].copy()
    y = df[TARGET_COL].copy()
    return X, y, cols


# ── Evaluation helper ──────────────────────────────────────────────────────────
def evaluate(model, X_test, y_test, name="Model"):
    y_pred = model.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    mae  = mean_absolute_error(y_test, y_pred)
    r2   = r2_score(y_test, y_pred)
    within_spec = np.mean((y_pred >= 3.8) & (y_pred <= 4.2) &
                          (y_test >= 3.8)  & (y_test <= 4.2))
    print(f"\n{'─'*50}")
    print(f"  {name}")
    print(f"  R²   = {r2:.4f}")
    print(f"  RMSE = {rmse:.4f}")
    print(f"  MAE  = {mae:.4f}")
    print(f"  In-Spec Accuracy = {within_spec:.4f}")
    print(f"{'─'*50}")
    return {"name": name, "r2": r2, "rmse": rmse, "mae": mae,
            "in_spec_accuracy": within_spec,
            "y_pred": y_pred.tolist(), "y_test": y_test.tolist()}


# ── XGBoost – tuned params ─────────────────────────────────────────────────────
XGBOOST_PARAMS = {
    "n_estimators":     800,
    "max_depth":        6,
    "learning_rate":    0.04,
    "subsample":        0.82,
    "colsample_bytree": 0.80,
    "min_child_weight": 3,
    "gamma":            0.05,
    "reg_alpha":        0.1,
    "reg_lambda":       1.5,
    "random_state":     42,
    "n_jobs":           -1,
    "tree_method":      "hist",
}


def train_xgboost(X_train, y_train):
    model = xgb.XGBRegressor(**XGBOOST_PARAMS)
    model.fit(
        X_train, y_train,
        eval_set=[(X_train, y_train)],
        verbose=False,
    )
    return model


def cross_validate_xgboost(X, y):
    kf = KFold(n_splits=5, shuffle=True, random_state=42)
    model = xgb.XGBRegressor(**XGBOOST_PARAMS)
    scores = cross_val_score(model, X, y, cv=kf, scoring="r2", n_jobs=-1)
    print(f"\nCross-Validation R² (5-fold): {scores}")
    print(f"  Mean: {scores.mean():.4f}  Std: {scores.std():.4f}")
    return scores


# ── Baseline models ────────────────────────────────────────────────────────────
def train_baselines(X_train, y_train):
    baselines = {
        "Ridge Regression": Ridge(alpha=1.0),
        "Random Forest":    RandomForestRegressor(
            n_estimators=200, max_depth=8, random_state=42, n_jobs=-1
        ),
        "Gradient Boosting": GradientBoostingRegressor(
            n_estimators=300, max_depth=5, learning_rate=0.05, random_state=42
        ),
    }
    trained = {}
    for name, m in baselines.items():
        m.fit(X_train, y_train)
        trained[name] = m
    return trained


# ── SHAP values ────────────────────────────────────────────────────────────────
def compute_shap(model, X_sample, feature_names):
    try:
        import shap
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(X_sample)
        mean_abs_shap = np.abs(shap_values).mean(axis=0)
        shap_importance = dict(zip(feature_names, mean_abs_shap.tolist()))
        # Sort descending
        shap_importance = dict(
            sorted(shap_importance.items(), key=lambda x: x[1], reverse=True)
        )
        return shap_importance, shap_values
    except Exception as e:
        print(f"SHAP computation warning: {e}")
        return {}, None


# ── Feature importance ─────────────────────────────────────────────────────────
def get_feature_importance(model, feature_names):
    imp = model.feature_importances_
    fi = dict(zip(feature_names, imp.tolist()))
    return dict(sorted(fi.items(), key=lambda x: x[1], reverse=True))


# ── Error analysis ─────────────────────────────────────────────────────────────
def error_analysis(y_test, y_pred):
    residuals = y_test - y_pred
    return {
        "mean_residual":   float(np.mean(residuals)),
        "std_residual":    float(np.std(residuals)),
        "p5_residual":     float(np.percentile(residuals, 5)),
        "p95_residual":    float(np.percentile(residuals, 95)),
        "pct_within_0_1":  float(np.mean(np.abs(residuals) < 0.1)),
        "pct_within_0_2":  float(np.mean(np.abs(residuals) < 0.2)),
        "pct_within_0_3":  float(np.mean(np.abs(residuals) < 0.3)),
    }


# ── Main training pipeline ─────────────────────────────────────────────────────
def train():
    print("=" * 60)
    print("  SoapPV-AI  |  ML Training Pipeline")
    print(f"  Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # 1. Load
    X, y, feature_names = load_data()
    print(f"\nDataset: {X.shape[0]:,} rows × {X.shape[1]} features")

    # 2. Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )
    print(f"Train: {len(X_train):,}  |  Test: {len(X_test):,}")

    # 3. Scale (kept for baselines)
    scaler = StandardScaler()
    X_train_sc = scaler.fit_transform(X_train)
    X_test_sc  = scaler.transform(X_test)

    # 4. Cross-validate XGBoost
    cv_scores = cross_validate_xgboost(X, y)

    # 5. Train XGBoost (primary)
    print("\nTraining XGBoost (primary model)...")
    xgb_model = train_xgboost(X_train, y_train)
    xgb_results = evaluate(xgb_model, X_test, y_test, "XGBoost (Primary)")

    # 6. Baselines
    print("\nTraining baseline models...")
    baselines = train_baselines(X_train_sc, y_train)
    baseline_results = []
    for name, m in baselines.items():
        res = evaluate(m, X_test_sc, y_test, name)
        baseline_results.append(res)

    # 7. Feature importance
    fi = get_feature_importance(xgb_model, feature_names)
    print(f"\nTop-10 Feature Importances:")
    for i, (k, v) in enumerate(list(fi.items())[:10]):
        print(f"  {i+1:2d}. {k:<35s} {v:.4f}")

    # 8. SHAP
    print("\nComputing SHAP values (sample of 500)...")
    sample_idx = np.random.choice(len(X_test), min(500, len(X_test)), replace=False)
    X_shap = X_test.iloc[sample_idx]
    shap_importance, shap_values = compute_shap(xgb_model, X_shap, feature_names)

    # 9. Error analysis
    ea = error_analysis(
        np.array(xgb_results["y_test"]),
        np.array(xgb_results["y_pred"])
    )
    print(f"\nError Analysis:")
    for k, v in ea.items():
        print(f"  {k}: {v:.4f}")

    # 10. Sensitivity analysis (per-feature perturbation)
    sensitivity = {}
    X_base = X_test.copy()
    base_pred = xgb_model.predict(X_base)
    for col in feature_names:
        X_perturbed = X_base.copy()
        delta = X_base[col].std() * 0.1
        X_perturbed[col] = X_base[col] + delta
        perturbed_pred = xgb_model.predict(X_perturbed)
        sensitivity[col] = float(np.mean(np.abs(perturbed_pred - base_pred)))
    sensitivity = dict(sorted(sensitivity.items(), key=lambda x: x[1], reverse=True))

    # 11. Save artifacts
    joblib.dump(xgb_model, f"{MODEL_DIR}/xgboost_model.pkl")
    joblib.dump(scaler,    f"{MODEL_DIR}/scaler.pkl")
    joblib.dump(feature_names, f"{MODEL_DIR}/feature_names.pkl")

    model_metrics = {
        "trained_at":    datetime.now().isoformat(),
        "model_version": "1.0.0",
        "dataset_size":  len(X),
        "train_size":    len(X_train),
        "test_size":     len(X_test),
        "features":      feature_names,
        "primary_model": {
            "name":       "XGBoost Regressor",
            "params":     XGBOOST_PARAMS,
            "r2":         xgb_results["r2"],
            "rmse":       xgb_results["rmse"],
            "mae":        xgb_results["mae"],
            "in_spec_accuracy": xgb_results["in_spec_accuracy"],
        },
        "cv_scores": {
            "mean": float(cv_scores.mean()),
            "std":  float(cv_scores.std()),
            "scores": cv_scores.tolist(),
        },
        "baseline_models": [
            {k: v for k, v in r.items() if k not in ("y_pred", "y_test")}
            for r in baseline_results
        ],
        "feature_importance": fi,
        "shap_importance":    shap_importance,
        "sensitivity":        sensitivity,
        "error_analysis":     ea,
        "target_range":       {"min": 3.8, "max": 4.2},
        "pv_range":           {"min": 3.0, "max": 5.0},
    }

    with open(f"{MODEL_DIR}/model_metrics.json", "w") as f:
        json.dump(model_metrics, f, indent=2)

    print(f"\n{'='*60}")
    print(f"  Training Complete!")
    print(f"  Primary Model R²: {xgb_results['r2']:.4f}")
    print(f"  Artifacts saved to: {MODEL_DIR}/")
    print(f"{'='*60}")
    return model_metrics


if __name__ == "__main__":
    train()
