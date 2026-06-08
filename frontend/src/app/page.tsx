"use client";
import { useEffect, useState } from "react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from "recharts";
import { TrendingUp, TrendingDown, Activity, Target, Cpu, Droplets } from "lucide-react";
import PVGauge from "@/components/PVGauge";
import { simulatePV, DEFAULT_PARAMS, getPVStatus, getPVColor } from "@/lib/api";

// Generate realistic historical trend
function generateHistory(n: number) {
  const data = [];
  let pv = 4.02;
  for (let i = n; i >= 0; i--) {
    pv += (Math.random() - 0.5) * 0.12;
    pv = Math.max(3.6, Math.min(4.5, pv));
    const t = new Date(Date.now() - i * 5 * 60 * 1000);
    data.push({
      time: t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      pv: parseFloat(pv.toFixed(3)),
      target: 4.0,
    });
  }
  return data;
}

const FEAT_IMPORTANCE = [
  { name: "Vacuum Pressure", value: 30.1, color: "#2dd4bf" },
  { name: "VP² (Quadratic)", value: 26.9, color: "#38bdf8" },
  { name: "Speed Std Dev", value: 7.0, color: "#a78bfa" },
  { name: "Pressure Deviation", value: 6.6, color: "#fbbf24" },
  { name: "VP Dev Squared", value: 6.4, color: "#fb923c" },
  { name: "Mixer Speed²", value: 4.2, color: "#f472b6" },
];

const QUALITY_DATA = [
  { name: "In-Spec", value: 72.3, color: "#4ade80" },
  { name: "Over-Spec", value: 22.4, color: "#f87171" },
  { name: "Under-Spec", value: 5.3, color: "#fbbf24" },
];

export default function Dashboard() {
  const [currentPV, setCurrentPV] = useState(4.031);
  const [history, setHistory] = useState(generateHistory(47));
  const [liveParams, setLiveParams] = useState(DEFAULT_PARAMS);

  // Simulate live updates
  useEffect(() => {
    const interval = setInterval(() => {
      const pv = simulatePV(liveParams);
      setCurrentPV(parseFloat(pv.toFixed(3)));
      setHistory((prev) => {
        const newPoint = {
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          pv: parseFloat(pv.toFixed(3)),
          target: 4.0,
        };
        return [...prev.slice(-47), newPoint];
      });
    }, 6000);
    return () => clearInterval(interval);
  }, [liveParams]);

  const status = getPVStatus(currentPV);
  const color = getPVColor(status);
  const recentInSpec = history.filter((h) => h.pv >= 3.8 && h.pv <= 4.2).length / history.length;

  const metrics = [
    {
      icon: Target,
      label: "In-Spec Rate",
      value: `${(recentInSpec * 100).toFixed(1)}%`,
      sub: "Last 4 hours",
      color: "#4ade80",
      trend: +2.1,
    },
    {
      icon: Cpu,
      label: "Model R²",
      value: "0.9105",
      sub: "XGBoost v1.0",
      color: "#2dd4bf",
      trend: null,
    },
    {
      icon: Activity,
      label: "RMSE",
      value: "0.0485",
      sub: "Test set error",
      color: "#38bdf8",
      trend: null,
    },
    {
      icon: Droplets,
      label: "Starch %",
      value: `${liveParams.starch_percentage.toFixed(1)}%`,
      sub: "Current batch",
      color: "#a78bfa",
      trend: null,
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">Operations Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time PV monitoring & ML predictions</p>
        </div>
        <div className="flex items-center gap-2 bg-secondary/50 border border-border px-3 py-2 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs font-mono text-green-400">LIVE</span>
          <span className="text-xs font-mono text-muted-foreground ml-1">{new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Top row: Gauge + metrics */}
      <div className="grid grid-cols-12 gap-4">
        {/* Gauge */}
        <div className="col-span-4 metric-card flex flex-col items-center justify-center py-4">
          <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2">Current PV Reading</div>
          <PVGauge value={currentPV} size={220} />
          <div className="mt-3 grid grid-cols-3 gap-3 w-full text-center text-xs font-mono">
            <div>
              <div className="text-amber-400">3.8</div>
              <div className="text-muted-foreground">Lower</div>
            </div>
            <div>
              <div className="text-green-400">4.0</div>
              <div className="text-muted-foreground">Target</div>
            </div>
            <div>
              <div className="text-red-400">4.2</div>
              <div className="text-muted-foreground">Upper</div>
            </div>
          </div>
        </div>

        {/* Right side */}
        <div className="col-span-8 space-y-4">
          {/* Metrics */}
          <div className="grid grid-cols-4 gap-3">
            {metrics.map(({ icon: Icon, label, value, sub, color, trend }) => (
              <div key={label} className="metric-card">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  {trend !== null && (
                    <div className={`flex items-center gap-0.5 text-xs ${trend > 0 ? "text-green-400" : "text-red-400"}`}>
                      {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(trend)}%
                    </div>
                  )}
                </div>
                <div className="font-mono text-xl font-bold" style={{ color }}>{value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                <div className="text-xs text-muted-foreground/60">{sub}</div>
              </div>
            ))}
          </div>

          {/* PV Trend chart */}
          <div className="metric-card">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-mono text-foreground">PV Trend — Last 4 Hours</div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-primary inline-block" />Predicted PV</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-400/50 inline-block" />Target</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={history} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 9, fontFamily: "Space Mono" }} tickLine={false} interval={7} />
                <YAxis domain={[3.5, 4.5]} tick={{ fill: "#64748b", fontSize: 9, fontFamily: "Space Mono" }} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(220 18% 11%)", border: "1px solid hsl(220 15% 18%)", borderRadius: 8 }}
                  labelStyle={{ color: "#94a3b8", fontSize: 10, fontFamily: "Space Mono" }}
                  itemStyle={{ color: "#2dd4bf", fontSize: 10, fontFamily: "Space Mono" }}
                />
                <ReferenceLine y={3.8} stroke="#fbbf24" strokeDasharray="3 3" strokeOpacity={0.5} />
                <ReferenceLine y={4.2} stroke="#f87171" strokeDasharray="3 3" strokeOpacity={0.5} />
                <Area type="monotone" dataKey="pv" stroke="#2dd4bf" strokeWidth={1.5} fill="url(#pvGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Quality distribution */}
        <div className="metric-card">
          <div className="text-sm font-mono text-foreground mb-3">Quality Distribution</div>
          <div className="flex items-center justify-center">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={QUALITY_DATA} cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={3} dataKey="value">
                  {QUALITY_DATA.map((entry, i) => (
                    <Cell key={i} fill={entry.color} opacity={0.85} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => `${v}%`} contentStyle={{ background: "hsl(220 18% 11%)", border: "1px solid hsl(220 15% 18%)", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {QUALITY_DATA.map(({ name, value, color }) => (
                <div key={name} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <div>
                    <div className="text-xs font-mono" style={{ color }}>{value}%</div>
                    <div className="text-xs text-muted-foreground">{name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Feature importance */}
        <div className="metric-card col-span-2">
          <div className="text-sm font-mono text-foreground mb-3">Top Feature Importance</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={FEAT_IMPORTANCE} layout="vertical" margin={{ left: 80, right: 10 }}>
              <XAxis type="number" tick={{ fill: "#64748b", fontSize: 9, fontFamily: "Space Mono" }} tickLine={false} domain={[0, 35]} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 9, fontFamily: "Space Mono" }} tickLine={false} width={80} />
              <Tooltip
                formatter={(v: any) => `${v.toFixed(1)}%`}
                contentStyle={{ background: "hsl(220 18% 11%)", border: "1px solid hsl(220 15% 18%)", borderRadius: 8 }}
                itemStyle={{ color: "#2dd4bf", fontSize: 10, fontFamily: "Space Mono" }}
              />
              <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                {FEAT_IMPORTANCE.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Process parameters */}
      <div className="metric-card">
        <div className="text-sm font-mono text-foreground mb-4">Current Process Parameters</div>
        <div className="grid grid-cols-6 gap-3">
          {[
            { label: "Mixer Speed", value: liveParams.mixer_turbo_speed_rpm, unit: "RPM", range: "1800–2800", normal: [2000, 2600] },
            { label: "Noodler Speed", value: liveParams.noodler_turbo_speed_rpm, unit: "RPM", range: "1200–2200", normal: [1400, 2000] },
            { label: "Pre-Plodder", value: liveParams.pre_plodder_turbo_speed_rpm, unit: "RPM", range: "1400–2400", normal: [1600, 2200] },
            { label: "Final Plodder", value: liveParams.final_plodder_turbo_speed_rpm, unit: "RPM", range: "1000–2000", normal: [1200, 1800] },
            { label: "Vacuum Press.", value: liveParams.vacuum_chamber_pressure_mmhg, unit: "mmHg", range: "400–700", normal: [500, 600] },
            { label: "Starch %", value: liveParams.starch_percentage, unit: "%", range: "0.5–4.0", normal: [1.0, 3.0] },
          ].map(({ label, value, unit, range, normal }) => {
            const isNormal = value >= normal[0] && value <= normal[1];
            return (
              <div key={label} className="bg-secondary/40 rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1 font-mono">{label}</div>
                <div className={`text-lg font-mono font-bold ${isNormal ? "text-green-400" : "text-amber-400"}`}>
                  {typeof value === "number" && value < 10 ? value.toFixed(1) : Math.round(value as number)}
                </div>
                <div className="text-xs text-muted-foreground">{unit}</div>
                <div className="text-xs text-muted-foreground/50 mt-0.5">{range}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
