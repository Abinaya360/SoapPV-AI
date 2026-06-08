"use client";
import { useState, useEffect } from "react";
import { ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Area, AreaChart } from "recharts";
import { AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { simulatePV, getPVStatus, getPVColor } from "@/lib/api";

// Generate control chart data
function generateControlData(n: number) {
  let pv = 4.01;
  return Array.from({ length: n }, (_, i) => {
    pv += (Math.random() - 0.5) * 0.15;
    pv = Math.max(3.5, Math.min(4.5, pv));
    const t = new Date(Date.now() - (n - i) * 15 * 60 * 1000);
    const status = getPVStatus(pv);
    return {
      time: t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      pv: parseFloat(pv.toFixed(3)),
      batch: `B${2400 + i}`,
      status,
      shift: ["Morning", "Afternoon", "Night"][Math.floor(i / 8) % 3],
    };
  });
}

// Generate batch history table
function generateBatches(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const pv = parseFloat((3.7 + Math.random() * 0.8).toFixed(3));
    const status = getPVStatus(pv);
    return {
      batchId: `B${2400 + i}`,
      time: new Date(Date.now() - (n - i) * 15 * 60 * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      pv,
      status,
      shift: ["Morning", "Afternoon", "Night"][Math.floor(i / 8) % 3],
      operator: ["Rajesh K.", "Priya M.", "Suresh P.", "Anita R."][i % 4],
    };
  });
}

export default function MonitoringPage() {
  const [controlData] = useState(generateControlData(48));
  const [batches] = useState(generateBatches(24));
  const [alertFilter, setAlertFilter] = useState<"all" | "out-of-spec">("all");

  const total = batches.length;
  const inSpec = batches.filter((b) => b.status === "In-Spec").length;
  const overSpec = batches.filter((b) => b.status === "Over-Spec").length;
  const underSpec = batches.filter((b) => b.status === "Under-Spec").length;
  const oosEvents = controlData.filter((d) => d.status !== "In-Spec").length;

  const filteredBatches = alertFilter === "out-of-spec" ? batches.filter((b) => b.status !== "In-Spec") : batches;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold">Quality Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-0.5">SPC control chart & 24-hour batch history</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-secondary/50 border border-border px-3 py-2 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span>Live · Updated every 15 min</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "In-Spec Batches", value: inSpec, total, color: "#4ade80", icon: CheckCircle },
          { label: "Over-Spec", value: overSpec, total, color: "#f87171", icon: XCircle },
          { label: "Under-Spec", value: underSpec, total, color: "#fbbf24", icon: AlertTriangle },
          { label: "OOS Events (4h)", value: oosEvents, total: controlData.length, color: "#38bdf8", icon: Clock },
        ].map(({ label, value, total: t, color, icon: Icon }) => (
          <div key={label} className="metric-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground">{label}</span>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <div className="text-2xl font-mono font-bold" style={{ color }}>{value}</div>
            <div className="text-xs text-muted-foreground mt-1">of {t} total</div>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(value / t) * 100}%`, background: color, opacity: 0.7 }} />
            </div>
          </div>
        ))}
      </div>

      {/* SPC Control Chart */}
      <div className="metric-card">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-mono text-foreground">SPC Control Chart — PV (12 hours)</div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-primary" />PV</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-green-400/50 border-dashed border-b border-green-400/50" />UCL/LCL</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />OOS</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={controlData} margin={{ left: -10, right: 10 }}>
            <defs>
              <linearGradient id="pvMonGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 9, fontFamily: "Space Mono" }} tickLine={false} interval={5} />
            <YAxis domain={[3.4, 4.6]} tick={{ fill: "#64748b", fontSize: 9, fontFamily: "Space Mono" }} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "hsl(220 18% 11%)", border: "1px solid hsl(220 15% 18%)", borderRadius: 8, fontFamily: "Space Mono", fontSize: 10 }}
              labelFormatter={(l: string, payload: any[]) => payload?.[0]?.payload?.batch ? `${payload[0].payload.batch} @ ${l}` : l}
              formatter={(v: any, n: string) => [v.toFixed(3), "PV"]}
            />
            {/* Control limits */}
            <ReferenceLine y={4.2} stroke="#f87171" strokeDasharray="4 4" strokeWidth={1} label={{ value: "UCL 4.2", fill: "#f87171", fontSize: 9, fontFamily: "Space Mono", position: "right" }} />
            <ReferenceLine y={3.8} stroke="#fbbf24" strokeDasharray="4 4" strokeWidth={1} label={{ value: "LCL 3.8", fill: "#fbbf24", fontSize: 9, fontFamily: "Space Mono", position: "right" }} />
            <ReferenceLine y={4.0} stroke="#4ade8030" strokeWidth={1} />
            <Area type="monotone" dataKey="pv" stroke="#2dd4bf" strokeWidth={1.5} fill="url(#pvMonGrad)" dot={(props: any) => {
              const { cx, cy, payload } = props;
              if (payload.status !== "In-Spec") {
                return <circle key={payload.batch} cx={cx} cy={cy} r={4} fill={payload.status === "Over-Spec" ? "#f87171" : "#fbbf24"} />;
              }
              return <circle key={payload.batch} cx={cx} cy={cy} r={2} fill="#2dd4bf" opacity={0.5} />;
            }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Batch history table */}
      <div className="metric-card">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-mono text-foreground">Batch History (Last 24h)</div>
          <div className="flex gap-2">
            {(["all", "out-of-spec"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setAlertFilter(f)}
                className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-all ${alertFilter === f ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:border-primary/20"}`}
              >
                {f === "all" ? "All Batches" : "Out-of-Spec"}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border">
                {["Batch ID", "Time", "PV", "Status", "Shift", "Operator", "Action"].map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredBatches.slice(-16).reverse().map((b) => {
                const color = getPVColor(b.status);
                return (
                  <tr key={b.batchId} className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                    <td className="py-2 px-3 text-foreground font-bold">{b.batchId}</td>
                    <td className="py-2 px-3 text-muted-foreground">{b.time}</td>
                    <td className="py-2 px-3 font-bold" style={{ color }}>{b.pv.toFixed(3)}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded text-xs font-mono" style={{ color, background: `${color}15`, border: `1px solid ${color}40` }}>
                        {b.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">{b.shift}</td>
                    <td className="py-2 px-3 text-muted-foreground">{b.operator}</td>
                    <td className="py-2 px-3">
                      {b.status !== "In-Spec" ? (
                        <a href="/optimization" className="text-primary hover:text-primary/80 underline text-xs">Fix →</a>
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
