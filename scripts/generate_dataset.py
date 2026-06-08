"""
SoapPV-AI: Industrial Synthetic Dataset Generator
Generates 20,000+ rows of realistic soap manufacturing process data
with nonlinear relationships between process variables and Penetration Value (PV)
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import random
import string
import os

# ── Reproducibility ────────────────────────────────────────────────────────────
np.random.seed(42)
random.seed(42)

# ── Constants ──────────────────────────────────────────────────────────────────
N_ROWS = 22_000
START_DATE = datetime(2023, 1, 1, 6, 0, 0)

# Industrial operating ranges
RANGES = {
    "mixer_turbo_speed":       (1800, 2800),   # RPM
    "noodler_turbo_speed":     (1200, 2200),   # RPM
    "pre_plodder_turbo_speed": (1400, 2400),   # RPM
    "final_plodder_turbo_speed": (1000, 2000), # RPM
    "vacuum_chamber_pressure": (400, 700),     # mmHg
    "starch_percentage":       (0.5, 4.0),     # %
}

SHIFTS = ["Morning", "Afternoon", "Night"]
MACHINE_STATUSES = ["Normal", "Normal", "Normal", "Degraded", "Maintenance"]


# ── Helper: Batch ID generator ────────────────────────────────────────────────
def make_batch_id(i: int) -> str:
    prefix = random.choice(["SPB", "MFG", "PRD"])
    return f"{prefix}-{2023 + i // 8000}-{str(i % 9999 + 1).zfill(5)}"


# ── Core PV Simulation (nonlinear physics-inspired) ───────────────────────────
def simulate_pv(
    mixer_rpm: np.ndarray,
    noodler_rpm: np.ndarray,
    pre_plodder_rpm: np.ndarray,
    final_plodder_rpm: np.ndarray,
    vacuum_pressure: np.ndarray,
    starch_pct: np.ndarray,
    machine_status: np.ndarray,
) -> np.ndarray:
    """
    Physics-inspired nonlinear PV model.
    Target PV range: 3.8–4.2 (optimal), overall 3.0–5.0
    """

    # ── Normalise to [0,1] ───────────────────────────────────────────────────
    mx  = (mixer_rpm        - 1800) / 1000
    nx  = (noodler_rpm      - 1200) / 1000
    ppx = (pre_plodder_rpm  - 1400) / 1000
    fpx = (final_plodder_rpm - 1000) / 1000
    vx  = (vacuum_pressure  - 400)  / 300
    sx  = (starch_pct       - 0.5)  / 3.5

    # ── Mean mechanical energy (nonlinear) ──────────────────────────────────
    mech_energy = 0.25 * mx + 0.20 * nx + 0.25 * ppx + 0.30 * fpx

    # ── Vacuum effect: optimal around 550 mmHg (vx ≈ 0.5) ──────────────────
    vacuum_effect = -1.2 * (vx - 0.5) ** 2 + 0.3 * vx

    # ── Starch: increases softness (lowers PV) up to ~2%, then rises ────────
    starch_effect = -0.8 * sx + 0.6 * sx ** 2

    # ── Interaction: high final_plodder × high starch → raises PV ───────────
    interaction_1 = 0.4 * fpx * sx

    # ── Interaction: vacuum × mixer speed ────────────────────────────────────
    interaction_2 = -0.3 * vx * mx

    # ── Non-linear curvature on mech energy ─────────────────────────────────
    mech_curve = 0.5 * mech_energy - 0.4 * mech_energy ** 2

    # ── Base PV ─────────────────────────────────────────────────────────────
    pv_base = (
        4.0
        + mech_curve
        + vacuum_effect
        + starch_effect
        + interaction_1
        + interaction_2
    )

    # ── Machine degradation penalty ──────────────────────────────────────────
    deg_mask = machine_status == "Degraded"
    pv_base[deg_mask] += np.random.normal(0.25, 0.12, deg_mask.sum())

    # ── Gaussian noise ───────────────────────────────────────────────────────
    noise = np.random.normal(0, 0.08, len(pv_base))
    pv = pv_base + noise

    # ── Clip to realistic range ──────────────────────────────────────────────
    return np.clip(pv, 3.0, 5.0)


# ── Environmental conditions ──────────────────────────────────────────────────
def add_environmental(n: int) -> dict:
    ambient_temp   = np.random.normal(28, 3, n).clip(18, 42)   # °C
    ambient_humidity = np.random.normal(62, 8, n).clip(35, 90)  # %
    coolant_temp   = np.random.normal(18, 2, n).clip(12, 28)   # °C
    return {
        "ambient_temperature_c":  np.round(ambient_temp, 1),
        "ambient_humidity_pct":   np.round(ambient_humidity, 1),
        "coolant_temp_c":         np.round(coolant_temp, 1),
    }


# ── Feature engineering ───────────────────────────────────────────────────────
def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    turbo_cols = [
        "mixer_turbo_speed_rpm",
        "noodler_turbo_speed_rpm",
        "pre_plodder_turbo_speed_rpm",
        "final_plodder_turbo_speed_rpm",
    ]

    df["mean_turbo_speed"]       = df[turbo_cols].mean(axis=1).round(2)
    df["turbo_speed_std"]        = df[turbo_cols].std(axis=1).round(2)
    df["turbo_speed_ratio"]      = (
        df["mixer_turbo_speed_rpm"] / df["final_plodder_turbo_speed_rpm"]
    ).round(4)
    df["pressure_deviation"]     = (df["vacuum_chamber_pressure_mmhg"] - 550).abs().round(2)
    df["process_load_index"]     = (
        df["mean_turbo_speed"] * df["starch_percentage"] / 100
    ).round(4)
    df["mechanical_energy_index"] = (
        0.25 * df["mixer_turbo_speed_rpm"]
        + 0.20 * df["noodler_turbo_speed_rpm"]
        + 0.25 * df["pre_plodder_turbo_speed_rpm"]
        + 0.30 * df["final_plodder_turbo_speed_rpm"]
    ).round(2)
    df["stability_score"] = (
        1 - df["turbo_speed_std"] / df["mean_turbo_speed"]
    ).round(4)
    df["mixer_final_interaction"]    = (
        df["mixer_turbo_speed_rpm"] * df["final_plodder_turbo_speed_rpm"] / 1e6
    ).round(4)
    df["vacuum_starch_interaction"]  = (
        df["vacuum_chamber_pressure_mmhg"] * df["starch_percentage"] / 1000
    ).round(4)
    df["plodder_ratio"]              = (
        df["pre_plodder_turbo_speed_rpm"] / df["final_plodder_turbo_speed_rpm"]
    ).round(4)
    df["energy_vacuum_interaction"]  = (
        df["mechanical_energy_index"] * df["vacuum_chamber_pressure_mmhg"] / 1e6
    ).round(6)

    return df


# ── Quality labelling ─────────────────────────────────────────────────────────
def label_quality(pv: np.ndarray) -> np.ndarray:
    labels = np.where(
        (pv >= 3.8) & (pv <= 4.2), "In-Spec",
        np.where(pv < 3.8, "Under-Spec", "Over-Spec")
    )
    return labels


# ── Main generation ────────────────────────────────────────────────────────────
def generate_dataset(n: int = N_ROWS, output_path: str = "data/soap_manufacturing_data.csv"):
    print(f"Generating {n:,} rows of industrial soap manufacturing data...")

    # -- Core process variables -----------------------------------------------
    machine_status_arr = np.random.choice(MACHINE_STATUSES, size=n)

    mixer_rpm         = np.random.uniform(*RANGES["mixer_turbo_speed"],         n)
    noodler_rpm       = np.random.uniform(*RANGES["noodler_turbo_speed"],       n)
    pre_plodder_rpm   = np.random.uniform(*RANGES["pre_plodder_turbo_speed"],   n)
    final_plodder_rpm = np.random.uniform(*RANGES["final_plodder_turbo_speed"], n)
    vacuum_pressure   = np.random.normal(550, 60, n).clip(400, 700)
    starch_pct        = np.random.beta(2, 5, n) * 3.5 + 0.5   # skewed toward lower values

    # -- Timestamps & metadata ------------------------------------------------
    timestamps = [START_DATE + timedelta(minutes=15 * i) for i in range(n)]
    shifts     = [SHIFTS[(ts.hour // 8) % 3] for ts in timestamps]
    batch_ids  = [make_batch_id(i) for i in range(n)]

    # -- Simulate PV ----------------------------------------------------------
    pv_values = simulate_pv(
        mixer_rpm, noodler_rpm, pre_plodder_rpm,
        final_plodder_rpm, vacuum_pressure, starch_pct,
        machine_status_arr,
    )

    # -- Build DataFrame -------------------------------------------------------
    env = add_environmental(n)

    df = pd.DataFrame({
        "timestamp":                    timestamps,
        "batch_id":                     batch_ids,
        "shift":                        shifts,
        "machine_status":               machine_status_arr,
        "mixer_turbo_speed_rpm":        np.round(mixer_rpm, 1),
        "noodler_turbo_speed_rpm":      np.round(noodler_rpm, 1),
        "pre_plodder_turbo_speed_rpm":  np.round(pre_plodder_rpm, 1),
        "final_plodder_turbo_speed_rpm": np.round(final_plodder_rpm, 1),
        "vacuum_chamber_pressure_mmhg": np.round(vacuum_pressure, 1),
        "starch_percentage":            np.round(starch_pct, 3),
        **env,
        "penetration_value":            np.round(pv_values, 3),
        "quality_status":               label_quality(pv_values),
    })

    # -- Feature engineering --------------------------------------------------
    df = engineer_features(df)

    # -- Sort & reset index ---------------------------------------------------
    df = df.sort_values("timestamp").reset_index(drop=True)

    # -- Save -----------------------------------------------------------------
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df.to_csv(output_path, index=False)

    # -- Summary --------------------------------------------------------------
    qs = df["quality_status"].value_counts(normalize=True) * 100
    print(f"\nDataset saved → {output_path}")
    print(f"Shape: {df.shape}")
    print(f"\nPV Statistics:\n  Mean={df['penetration_value'].mean():.3f}  "
          f"Std={df['penetration_value'].std():.3f}  "
          f"Min={df['penetration_value'].min():.3f}  "
          f"Max={df['penetration_value'].max():.3f}")
    print(f"\nQuality Distribution:")
    for k, v in qs.items():
        print(f"  {k}: {v:.1f}%")
    return df


if __name__ == "__main__":
    generate_dataset()
