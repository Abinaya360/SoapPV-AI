"use client";
import { useState } from "react";
import { Settings2, ArrowRight, TrendingUp, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import PVGauge from "@/components/PVGauge";
import { DEFAULT_PARAMS, simulatePV, getPVStatus, getPVColor, type ProcessParams } from "@/lib/api";

const SCENARIOS = [
  {
    name: "Under-Spec Batch",
    desc: "Low vacuum + high starch causing soft bar",
    params: { ...DEFAULT_PARAMS, vacuum_chamber_pressure_mmhg: 450, starch_percentage: 3.5, mixer_turbo_speed_rpm: 1900 },
  },
  {
    name: "Over-Spec Batch",
    desc: "High speed + low pressure causing hard bar",
    params: { ...DEFAULT_PARAMS, vacuum_chamber_pressure_mmhg: 650, starch_percentage: 0.8, final_plodder_turbo_speed_rpm: 1900 },
  },
  {
    name: "Borderline High",
    desc: "Slightly over-spec — minor adjustment needed",
    params: { ...DEFAULT_PARAMS, vacuum_chamber_pressure_mmhg: 590, starch_percentage: 1.2, mixer_turbo_speed_rpm: 2600 },
  },
];

interface Recommendation {
  parameter: string;
  label: string;
  current: number;
  recommended: number;
  change_pct: number;
  priority: "High" | "Medium" | "Low";
  reason: string;
  unit: string;
}

function generateRecommendations(params: ProcessParams, originalPV: number): { recs: Recommendation[]; correctedPV: number; correctedParams: ProcessParams } {
  const recs: Recommendation[] = [];
  const corrected = { ...params };
  const isOver = originalPV > 4.2;
  const isUnder = originalPV < 3.8;

  if (isUnder) {
    // Under-spec: increase vacuum toward 550, reduce starch, increase mixer
    if (Math.abs(params.vacuum_chamber_pressure_mmhg - 550) > 30) {
      const rec = Math.round(Math.min(550, params.vacuum_chamber_pressure_mmhg + 60));
      recs.push({
        parameter: "vacuum_chamber_pressure_mmhg",
        label: "Vacuum Pressure",
        current: params.vacuum_chamber_pressure_mmhg,
        recommended: rec,
        change_pct: ((rec - params.vacuum_chamber_pressure_mmhg) / params.vacuum_chamber_pressure_mmhg) * 100,
        priority: "High",
        reason: "Vacuum pressure is too low. Optimal range 520–580 mmHg ensures proper soap homogenization.",
        unit: "mmHg",
      });
      corrected.vacuum_chamber_pressure_mmhg = rec;
    }
    if (params.starch_percentage > 2.5) {
      const rec = parseFloat((params.starch_percentage - 0.8).toFixed(1));
      recs.push({
        parameter: "starch_percentage",
        label: "Starch %",
        current: params.starch_percentage,
        recommended: rec,
        change_pct: ((rec - params.starch_percentage) / params.starch_percentage) * 100,
        priority: "Medium",
        reason: "High starch content softens the bar. Reducing starch improves PV toward target range.",
        unit: "%",
      });
      corrected.starch_percentage = rec;
    }
    if (params.mixer_turbo_speed_rpm < 2100) {
      const rec = Math.min(2400, params.mixer_turbo_speed_rpm + 200);
      recs.push({
        parameter: "mixer_turbo_speed_rpm",
        label: "Mixer Speed",
        current: params.mixer_turbo_speed_rpm,
        recommended: rec,
        change_pct: ((rec - params.mixer_turbo_speed_rpm) / params.mixer_turbo_speed_rpm) * 100,
        priority: "Medium",
        reason: "Higher mixer speed improves soap homogeneity and mechanical energy input.",
        unit: "RPM",
      });
      corrected.mixer_turbo_speed_rpm = rec;
    }
  }

  if (isOver) {
    if (params.vacuum_chamber_pressure_mmhg > 580) {
      const rec = Math.round(Math.max(520, params.vacuum_chamber_pressure_mmhg - 70));
      recs.push({
        parameter: "vacuum_chamber_pressure_mmhg",
        label: "Vacuum Pressure",
        current: params.vacuum_chamber_pressure_mmhg,
        recommended: rec,
        change_pct: ((rec - params.vacuum_chamber_pressure_mmhg) / params.vacuum_chamber_pressure_mmhg) * 100,
        priority: "High",
        reason: "High vacuum pressure over-hardens the bar. Reduce toward optimal 550 mmHg.",
        unit: "mmHg",
      });
      corrected.vacuum_chamber_pressure_mmhg = rec;
    }
    if (params.final_plodder_turbo_speed_rpm > 1700) {
      const rec = Math.max(1200, params.final_plodder_turbo_speed_rpm - 250);
      recs.push({
        parameter: "final_plodder_turbo_speed_rpm",
        label: "Final Plodder Speed",
        current: params.final_plodder_turbo_speed_rpm,
        recommended: rec,
        change_pct: ((rec - params.final_plodder_turbo_speed_rpm) / params.final_plodder_turbo_speed_rpm) * 100,
        priority: "Medium",
        reason: "Reducing final plodder speed decreases compaction force, softening PV.",
        unit: "RPM",
      });
      corrected.final_plodder_turbo_speed_rpm = rec;
    }
    if (params.starch_percentage < 1.5) {
      const rec = parseFloat((params.starch_percentage + 0.6).toFixed(1));
      recs.push({
        parameter: "starch_percentage",
        label: "Starch %",
        current: params.starch_percentage,
        recommended: rec,
        change_pct: ((rec - params.starch_percentage) / params.starch_percentage) * 100,
        priority: "Low",
        reason: "Slightly increasing starch content can reduce over-hardness.",
        unit: "%",
      });
      corrected.starch_percentage = rec;
    }
  }

  const correctedPV = simulatePV(corrected);
  return { recs, correctedPV: parseFloat(correctedPV.toFixed(3)), correctedParams: corrected };
}

const PRIORITY_STYLE: Record<string, string> = {
  High: "text-red-400 bg-red-500/10 border-red-500/30",
  Medium: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  Low: "text-blue-400 bg-blue-500/10 border-blue-500/30",
};

export default function OptimizationPage() {
  const [params, setParams] = useState<ProcessParams>({ ...DEFAULT_PARAMS });
  const [result, setResult] = useState<ReturnType<typeof generateRecommendations> | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<number | null>(null);

  const originalPV = parseFloat(simulatePV(params).toFixed(3));
  const originalStatus = getPVStatus(originalPV);

  function loadScenario(i: number) {
    setSelectedScenario(i);
    setParams(SCENARIOS[i].params);
    setResult(null);
  }

  async function optimize() {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 900));
    setResult(generateRecommendations(params, originalPV));
    setLoading(false);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-mono font-bold">Process Optimization</h1>
        <p className="text-sm text-muted-foreground mt-0.5">AI-driven corrective action recommendations</p>
      </div>

      {/* Scenario selector */}
      <div className="grid grid-cols-3 gap-3">
        {SCENARIOS.map((s, i) => (
          <button
            key={i}
            onClick={() => loadScenario(i)}
            className={`text-left metric-card transition-all ${selectedScenario === i ? "border-primary/50 bg-primary/5" : ""}`}
          >
            <div className="text-xs font-mono text-primary mb-1">{`Scenario ${i + 1}`}</div>
            <div className="text-sm font-mono font-bold text-foreground">{s.name}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.desc}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* Current state */}
        <div className="col-span-5 space-y-4">
          <div className="metric-card">
            <div className="text-sm font-mono text-foreground mb-4 flex items-center justify-between">
              <span>Current State</span>
              <span className={`text-xs px-2 py-0.5 rounded border font-mono ${PRIORITY_STYLE[originalStatus === "In-Spec" ? "Low" : originalStatus === "Over-Spec" ? "High" : "Medium"]}`}>
                {originalStatus}
              </span>
            </div>
            <div className="flex justify-center">
              <PVGauge value={originalPV} size={190} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {[
                { label: "Vacuum Press.", value: `${params.vacuum_chamber_pressure_mmhg} mmHg`, key: "vacuum" },
                { label: "Starch %", value: `${params.starch_percentage}%`, key: "starch" },
                { label: "Mixer Speed", value: `${params.mixer_turbo_speed_rpm} RPM`, key: "mixer" },
                { label: "Final Plodder", value: `${params.final_plodder_turbo_speed_rpm} RPM`, key: "fp" },
              ].map(({ label, value, key }) => (
                <div key={key} className="bg-secondary/40 rounded-lg p-2.5">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-sm font-mono text-foreground mt-0.5">{value}</div>
                </div>
              ))}
            </div>
            <button
              onClick={optimize}
              disabled={loading || originalStatus === "In-Spec"}
              className={`w-full mt-4 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-mono transition-all duration-200 ${
                originalStatus === "In-Spec"
                  ? "bg-green-500/10 border border-green-500/30 text-green-400 cursor-not-allowed"
                  : "bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary"
              }`}
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Settings2 className="w-4 h-4" />}
              {loading ? "Optimizing..." : originalStatus === "In-Spec" ? "Already In-Spec" : "Run Optimizer"}
            </button>
          </div>
        </div>

        {/* Recommendations */}
        <div className="col-span-7 space-y-4">
          {result ? (
            <>
              {/* Corrected gauge */}
              <div className="metric-card flex flex-col items-center py-4">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2">Corrected PV Prediction</div>
                <PVGauge value={result.correctedPV} size={190} />
                <div className="flex items-center gap-3 mt-3 text-sm font-mono">
                  <span className="text-muted-foreground">{originalPV.toFixed(3)}</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  <span className="text-primary font-bold">{result.correctedPV.toFixed(3)}</span>
                  <span className={`${result.correctedPV >= 3.8 && result.correctedPV <= 4.2 ? "text-green-400" : "text-amber-400"}`}>
                    ({(result.correctedPV - originalPV) > 0 ? "+" : ""}{(result.correctedPV - originalPV).toFixed(3)})
                  </span>
                </div>
                {result.correctedPV >= 3.8 && result.correctedPV <= 4.2 && (
                  <div className="mt-2 flex items-center gap-2 text-green-400 text-xs font-mono">
                    <CheckCircle className="w-3 h-3" />
                    Optimization successful — PV brought into spec
                  </div>
                )}
              </div>

              {/* Recommendation cards */}
              <div className="space-y-3">
                <div className="text-sm font-mono text-foreground">Recommended Actions ({result.recs.length})</div>
                {result.recs.length === 0 ? (
                  <div className="metric-card text-center text-muted-foreground font-mono text-sm py-8">
                    No adjustments recommended.
                  </div>
                ) : (
                  result.recs.map((rec, i) => (
                    <div key={i} className={`metric-card border ${PRIORITY_STYLE[rec.priority].split(" ")[2]}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${PRIORITY_STYLE[rec.priority]}`}>
                              {rec.priority} Priority
                            </span>
                            <span className="text-sm font-mono font-bold text-foreground">{rec.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{rec.reason}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs text-muted-foreground font-mono">{rec.current} {rec.unit}</div>
                          <ArrowRight className="w-3 h-3 text-primary mx-auto my-1" />
                          <div className="text-sm font-mono font-bold text-primary">{typeof rec.recommended === "number" && rec.recommended < 10 ? rec.recommended.toFixed(1) : rec.recommended} {rec.unit}</div>
                          <div className={`text-xs font-mono ${rec.change_pct > 0 ? "text-green-400" : "text-red-400"}`}>
                            {rec.change_pct > 0 ? "+" : ""}{rec.change_pct.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="metric-card flex flex-col items-center justify-center py-20 text-center">
              <Settings2 className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <div className="text-sm font-mono text-muted-foreground">
                {originalStatus === "In-Spec"
                  ? "Current PV is within target range. No optimization needed."
                  : "Select a scenario or run the optimizer to see recommendations."}
              </div>
              {originalStatus !== "In-Spec" && (
                <button onClick={optimize} className="mt-4 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary px-6 py-2 rounded-lg text-sm font-mono">
                  Run Optimizer
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
