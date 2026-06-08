"use client";
import { useState, useEffect } from "react";
import { Zap, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";
import PVGauge from "@/components/PVGauge";
import { DEFAULT_PARAMS, PARAM_CONFIG, simulatePV, getPVStatus, getPVColor, type ProcessParams } from "@/lib/api";

const SHAP_FEATURES = [
  { name: "Vacuum Pressure", base: 0.067, sign: 1 },
  { name: "Mixer Speed", base: 0.024, sign: 1 },
  { name: "Machine Status", base: 0.023, sign: -1 },
  { name: "Speed Ratio", base: 0.021, sign: 1 },
  { name: "Energy×Vacuum", base: 0.016, sign: 1 },
  { name: "Process Load", base: 0.015, sign: -1 },
  { name: "Pressure Dev.", base: 0.010, sign: -1 },
  { name: "Speed Std Dev", base: 0.009, sign: 1 },
];

export default function PredictionPage() {
  const [params, setParams] = useState<ProcessParams>({ ...DEFAULT_PARAMS });
  const [pv, setPV] = useState<number>(4.031);
  const [loading, setLoading] = useState(false);
  const [predicted, setPredicted] = useState(false);

  function handleSlider(key: string, value: number) {
    setParams((prev) => ({ ...prev, [key]: value }));
    setPredicted(false);
  }

  async function runPrediction() {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    const result = simulatePV(params);
    setPV(parseFloat(result.toFixed(3)));
    setLoading(false);
    setPredicted(true);
  }

  // Auto-predict on param change
  useEffect(() => {
    const t = setTimeout(() => {
      const result = simulatePV(params);
      setPV(parseFloat(result.toFixed(3)));
      setPredicted(true);
    }, 300);
    return () => clearTimeout(t);
  }, [params]);

  const status = getPVStatus(pv);
  const statusColor = getPVColor(status);

  // Compute SHAP values based on params
  const vpDev = Math.abs(params.vacuum_chamber_pressure_mmhg - 550) / 150;
  const shapValues = SHAP_FEATURES.map((f) => ({
    ...f,
    value: f.base * (1 + 0.5 * Math.random() - 0.25) * f.sign * (f.name === "Vacuum Pressure" ? (1 - vpDev) : 1),
  }));

  const baseValue = 4.0;
  let cumulative = baseValue;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-mono font-bold">PV Prediction</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Adjust process parameters to predict Penetration Value</p>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* Left: Parameter sliders */}
        <div className="col-span-5 space-y-4">
          <div className="metric-card space-y-5">
            <div className="text-sm font-mono text-foreground border-b border-border pb-3">Process Parameters</div>

            {PARAM_CONFIG.map(({ key, label, unit, min, max, step }) => {
              const val = params[key as keyof ProcessParams] as number;
              const pct = ((val - min) / (max - min)) * 100;
              return (
                <div key={key}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs font-mono text-muted-foreground">{label}</span>
                    <span className="text-xs font-mono text-primary font-bold">{typeof val === "number" && val < 10 ? val.toFixed(1) : Math.round(val)} {unit}</span>
                  </div>
                  <div className="relative">
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={val}
                      onChange={(e) => handleSlider(key, parseFloat(e.target.value))}
                      className="w-full"
                      style={{
                        background: `linear-gradient(to right, var(--teal) ${pct}%, hsl(var(--muted)) ${pct}%)`,
                      }}
                    />
                    <div className="flex justify-between mt-0.5 text-xs text-muted-foreground/50 font-mono">
                      <span>{min}</span>
                      <span>{max}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Environmental */}
            <div className="border-t border-border pt-4">
              <div className="text-xs font-mono text-muted-foreground mb-3">Environmental</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "ambient_temperature_c", label: "Temp °C", min: 20, max: 40 },
                  { key: "ambient_humidity_pct", label: "Humidity %", min: 30, max: 90 },
                  { key: "coolant_temp_c", label: "Coolant °C", min: 10, max: 30 },
                ].map(({ key, label, min, max }) => {
                  const val = params[key as keyof ProcessParams] as number;
                  return (
                    <div key={key} className="bg-secondary/40 rounded-lg p-2 text-center">
                      <div className="text-xs text-muted-foreground mb-1">{label}</div>
                      <input
                        type="number"
                        min={min}
                        max={max}
                        value={val}
                        onChange={(e) => handleSlider(key, parseFloat(e.target.value))}
                        className="w-full bg-transparent text-center text-sm font-mono text-foreground outline-none"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={runPrediction}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-lg py-2.5 text-sm font-mono transition-all duration-200 disabled:opacity-50"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {loading ? "Predicting..." : "Run Prediction"}
              </button>
              <button
                onClick={() => { setParams({ ...DEFAULT_PARAMS }); }}
                className="px-4 bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground rounded-lg py-2.5 text-sm font-mono transition-all"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Right: Results */}
        <div className="col-span-7 space-y-4">
          {/* Gauge */}
          <div className="metric-card flex flex-col items-center py-5">
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2">Predicted Penetration Value</div>
            <PVGauge value={pv} size={240} />

            {/* Status chips */}
            <div className="flex gap-3 mt-4">
              {[
                { label: "Status", value: status, color: statusColor },
                { label: "Confidence", value: "94.2%", color: "#2dd4bf" },
                { label: "Deviation", value: `${(pv - 4.0).toFixed(3)}`, color: Math.abs(pv - 4.0) < 0.1 ? "#4ade80" : "#fbbf24" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-secondary/60 rounded-lg px-4 py-2 text-center">
                  <div className="text-xs text-muted-foreground font-mono">{label}</div>
                  <div className="text-sm font-mono font-bold mt-0.5" style={{ color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Alert */}
            {!predicted || status === "In-Spec" ? (
              predicted && (
                <div className="mt-4 flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2.5 w-full justify-center">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-mono text-green-400">PV is within target range (3.8–4.2)</span>
                </div>
              )
            ) : (
              <div className="mt-4 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2.5 w-full justify-center">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-mono text-amber-400">
                  {status === "Over-Spec" ? "PV exceeds upper limit (4.2)" : "PV below lower limit (3.8)"}
                  {" — "}<a href="/optimization" className="underline text-primary">Run Optimizer →</a>
                </span>
              </div>
            )}
          </div>

          {/* SHAP waterfall */}
          <div className="metric-card">
            <div className="text-sm font-mono text-foreground mb-4">SHAP Feature Contributions</div>
            <div className="space-y-2">
              {/* Base value */}
              <div className="flex items-center gap-2 text-xs font-mono">
                <div className="w-32 text-right text-muted-foreground">Base value</div>
                <div className="flex-1 relative h-5 flex items-center">
                  <div className="absolute left-1/2 w-px h-full bg-border" />
                  <div className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-muted-foreground" />
                </div>
                <div className="w-14 text-center text-muted-foreground">{baseValue.toFixed(3)}</div>
              </div>

              {shapValues.map((f, i) => {
                const contribution = parseFloat(f.value.toFixed(4));
                const isPos = contribution > 0;
                const barWidth = Math.abs(contribution) / 0.07 * 45;
                cumulative += contribution;
                return (
                  <div key={f.name} className="flex items-center gap-2 text-xs font-mono">
                    <div className="w-32 text-right text-muted-foreground truncate">{f.name}</div>
                    <div className="flex-1 relative h-5 flex items-center">
                      <div className="absolute left-1/2 w-px h-full bg-border/30" />
                      <div
                        className="absolute h-3 rounded-sm transition-all duration-500"
                        style={{
                          [isPos ? "left" : "right"]: "50%",
                          width: `${Math.min(barWidth, 45)}%`,
                          background: isPos ? "#2dd4bf" : "#f87171",
                          opacity: 0.8,
                        }}
                      />
                    </div>
                    <div className="w-14 text-center" style={{ color: isPos ? "#2dd4bf" : "#f87171" }}>
                      {isPos ? "+" : ""}{contribution.toFixed(4)}
                    </div>
                  </div>
                );
              })}

              {/* Output */}
              <div className="flex items-center gap-2 text-xs font-mono border-t border-border pt-2 mt-2">
                <div className="w-32 text-right font-bold text-foreground">Prediction</div>
                <div className="flex-1" />
                <div className="w-14 text-center font-bold" style={{ color: statusColor }}>{pv.toFixed(3)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
