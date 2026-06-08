const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface ProcessParams {
  mixer_turbo_speed_rpm: number;
  noodler_turbo_speed_rpm: number;
  pre_plodder_turbo_speed_rpm: number;
  final_plodder_turbo_speed_rpm: number;
  vacuum_chamber_pressure_mmhg: number;
  starch_percentage: number;
  ambient_temperature_c?: number;
  ambient_humidity_pct?: number;
  coolant_temp_c?: number;
  machine_status?: string;
  shift?: string;
  batch_id?: string;
}

/** Matches backend PredictionResponse schema */
export interface PredictionResult {
  predicted_pv: number;
  quality_status: string;    // "In-Spec" | "Over-Spec" | "Under-Spec"
  in_spec: boolean;
  confidence: number;
  deviation: number;
  target_range: { min: number; max: number };
}

/** Matches backend OptimizationResponse schema */
export interface RecommendationResult {
  current_pv: number;
  current_status: string;
  needs_correction: boolean;
  corrected_pv: number;
  improvement: number;
  recommendations: Array<{
    parameter: string;
    unit: string;
    current_value: number;
    recommended_value: number;
    delta: number;
    direction: string;
    priority: string;
    reason: string;
  }>;
  optimized_params?: Record<string, number>;
}

export interface ModelMetrics {
  primary_model: { r2: number; rmse: number; mae: number; in_spec_accuracy: number };
  cv_scores: { mean: number; std: number };
  baseline_models: Array<{ name: string; r2: number; rmse: number; mae: number }>;
  feature_importance: Record<string, number>;
  shap_importance: Record<string, number>;
  sensitivity: Record<string, number>;
  error_analysis: { pct_within_0_1: number; pct_within_0_2: number; mean_residual: number; std_residual: number };
}

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  predict: (params: ProcessParams) =>
    fetchAPI<PredictionResult>("/predict", { method: "POST", body: JSON.stringify(params) }),
  recommend: (params: ProcessParams) =>
    fetchAPI<RecommendationResult>("/recommend", { method: "POST", body: JSON.stringify(params) }),
  explain: (params: ProcessParams) =>
    fetchAPI<any>("/explain", { method: "POST", body: JSON.stringify(params) }),
  metrics: () => fetchAPI<ModelMetrics>("/model-metrics"),
  health: () => fetchAPI<{ status: string; model_loaded: boolean }>("/health"),
  stats: () => fetchAPI<any>("/stats"),
  historicalTrends: (hours = 24) => fetchAPI<any>(`/historical-trends?hours=${hours}`),
  batchAnalysis: (records: ProcessParams[]) =>
    fetchAPI<any>("/batch-analysis", { method: "POST", body: JSON.stringify({ records }) }),
};

// ─── Physics-based demo simulation (when backend unavailable) ────────────────
export function simulatePV(params: ProcessParams): number {
  const vp = params.vacuum_chamber_pressure_mmhg;
  const mx = params.mixer_turbo_speed_rpm;
  const fp = params.final_plodder_turbo_speed_rpm;
  const sx = params.starch_percentage;
  const pp = params.pre_plodder_turbo_speed_rpm;
  const vpNorm = (vp - 550) / 150;
  const vacuumEffect = -0.45 * vpNorm * vpNorm + 0.05 * vpNorm;
  const mechNorm = (mx / 2300 + fp / 1500 + pp / 1900) / 3;
  const mechEffect = 0.2 * (mechNorm - 0.5);
  const sxNorm = (sx - 2.25) / 1.75;
  const starchEffect = -0.12 * sxNorm * sxNorm - 0.08 * sxNorm;
  const interactionEffect = 0.04 * vpNorm * (mx / 2300 - 0.5);
  const pv = 4.0 + vacuumEffect + mechEffect + starchEffect + interactionEffect;
  return Math.max(3.0, Math.min(5.0, pv + (Math.random() - 0.5) * 0.05));
}

export function getPVStatus(pv: number): "In-Spec" | "Over-Spec" | "Under-Spec" {
  if (pv >= 3.8 && pv <= 4.2) return "In-Spec";
  if (pv > 4.2) return "Over-Spec";
  return "Under-Spec";
}

export function getPVColor(status: string): string {
  if (status === "In-Spec") return "#4ade80";
  if (status === "Over-Spec") return "#f87171";
  return "#fbbf24";
}

export const DEFAULT_PARAMS: ProcessParams = {
  mixer_turbo_speed_rpm: 2300,
  noodler_turbo_speed_rpm: 1700,
  pre_plodder_turbo_speed_rpm: 1900,
  final_plodder_turbo_speed_rpm: 1500,
  vacuum_chamber_pressure_mmhg: 550,
  starch_percentage: 2.0,
  ambient_temperature_c: 28,
  ambient_humidity_pct: 60,
  coolant_temp_c: 18,
  machine_status: "Normal",
  shift: "Morning",
};

export const PARAM_CONFIG = [
  { key: "mixer_turbo_speed_rpm",         label: "Mixer Turbo Speed",    unit: "RPM",  min: 1800, max: 2800, step: 10  },
  { key: "noodler_turbo_speed_rpm",       label: "Noodler Turbo Speed",  unit: "RPM",  min: 1200, max: 2200, step: 10  },
  { key: "pre_plodder_turbo_speed_rpm",   label: "Pre-Plodder Speed",    unit: "RPM",  min: 1400, max: 2400, step: 10  },
  { key: "final_plodder_turbo_speed_rpm", label: "Final Plodder Speed",  unit: "RPM",  min: 1000, max: 2000, step: 10  },
  { key: "vacuum_chamber_pressure_mmhg",  label: "Vacuum Pressure",      unit: "mmHg", min: 400,  max: 700,  step: 5   },
  { key: "starch_percentage",             label: "Starch %",             unit: "%",    min: 0.5,  max: 4.0,  step: 0.1 },
] as const;
