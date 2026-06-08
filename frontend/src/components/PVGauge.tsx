"use client";
import { useEffect, useState } from "react";

interface PVGaugeProps {
  value: number;
  min?: number;
  max?: number;
  targetMin?: number;
  targetMax?: number;
  size?: number;
}

export default function PVGauge({
  value,
  min = 3.0,
  max = 5.0,
  targetMin = 3.8,
  targetMax = 4.2,
  size = 220,
}: PVGaugeProps) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { setTimeout(() => setAnimated(true), 100); }, [value]);

  const cx = size / 2;
  const cy = size / 2 + 20;
  const r = (size / 2) * 0.78;
  const startAngle = -220;
  const endAngle = 40;
  const totalAngle = endAngle - startAngle;

  const pct = (value - min) / (max - min);
  const targetMinPct = (targetMin - min) / (max - min);
  const targetMaxPct = (targetMax - min) / (max - min);

  function polarToCart(angle: number, radius: number) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function describeArc(startPct: number, endPct: number, radius: number) {
    const sa = startAngle + startPct * totalAngle;
    const ea = startAngle + endPct * totalAngle;
    const s = polarToCart(sa, radius);
    const e = polarToCart(ea, radius);
    const largeArc = (ea - sa) > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  }

  const needleAngle = startAngle + (animated ? pct : 0.5) * totalAngle;
  const needleEnd = polarToCart(needleAngle, r * 0.82);
  const needleBase1 = polarToCart(needleAngle + 90, 8);
  const needleBase2 = polarToCart(needleAngle - 90, 8);

  const isInSpec = value >= targetMin && value <= targetMax;
  const mainColor = isInSpec ? "#4ade80" : value > targetMax ? "#f87171" : "#fbbf24";

  const ticks = [3.0, 3.2, 3.4, 3.6, 3.8, 4.0, 4.2, 4.4, 4.6, 4.8, 5.0];

  return (
    <svg width={size} height={size * 0.85} viewBox={`0 0 ${size} ${size * 0.85}`}>
      {/* Background arc */}
      <path d={describeArc(0, 1, r)} stroke="rgba(255,255,255,0.06)" strokeWidth="14" fill="none" strokeLinecap="round" />

      {/* Under-spec zone */}
      <path d={describeArc(0, targetMinPct, r)} stroke="#fbbf2440" strokeWidth="14" fill="none" strokeLinecap="round" />

      {/* Target zone */}
      <path d={describeArc(targetMinPct, targetMaxPct, r)} stroke="#4ade8030" strokeWidth="14" fill="none" strokeLinecap="round" />

      {/* Over-spec zone */}
      <path d={describeArc(targetMaxPct, 1, r)} stroke="#f8717140" strokeWidth="14" fill="none" strokeLinecap="round" />

      {/* Value arc */}
      <path
        d={describeArc(0, animated ? Math.min(pct, 1) : 0, r)}
        stroke={mainColor}
        strokeWidth="14"
        fill="none"
        strokeLinecap="round"
        style={{ transition: "all 1s cubic-bezier(0.34, 1.56, 0.64, 1)", filter: `drop-shadow(0 0 6px ${mainColor}80)` }}
      />

      {/* Target zone markers */}
      {[targetMinPct, targetMaxPct].map((p, i) => {
        const pt = polarToCart(startAngle + p * totalAngle, r + 12);
        return <circle key={i} cx={pt.x} cy={pt.y} r="3" fill="#4ade80" opacity="0.7" />;
      })}

      {/* Ticks */}
      {ticks.map((tick) => {
        const tp = (tick - min) / (max - min);
        const innerPt = polarToCart(startAngle + tp * totalAngle, r - 18);
        const outerPt = polarToCart(startAngle + tp * totalAngle, r - 8);
        const labelPt = polarToCart(startAngle + tp * totalAngle, r - 30);
        return (
          <g key={tick}>
            <line x1={innerPt.x} y1={innerPt.y} x2={outerPt.x} y2={outerPt.y} stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
            {[3.0, 3.5, 4.0, 4.5, 5.0].includes(tick) && (
              <text x={labelPt.x} y={labelPt.y} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.4)" fontSize="9" fontFamily="Space Mono">
                {tick.toFixed(1)}
              </text>
            )}
          </g>
        );
      })}

      {/* Needle */}
      <polygon
        points={`${needleEnd.x},${needleEnd.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
        fill={mainColor}
        style={{ transition: "all 1s cubic-bezier(0.34, 1.56, 0.64, 1)", filter: `drop-shadow(0 0 4px ${mainColor})` }}
      />
      <circle cx={cx} cy={cy} r="8" fill="hsl(var(--card))" stroke={mainColor} strokeWidth="2" />
      <circle cx={cx} cy={cy} r="3" fill={mainColor} />

      {/* Center value */}
      <text x={cx} y={cy - r * 0.35} textAnchor="middle" fill={mainColor} fontSize="32" fontFamily="Space Mono" fontWeight="bold"
        style={{ transition: "fill 0.5s ease" }}>
        {value.toFixed(3)}
      </text>
      <text x={cx} y={cy - r * 0.35 + 28} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="10" fontFamily="Space Mono">
        PENETRATION VALUE
      </text>

      {/* Status badge */}
      <rect x={cx - 40} y={cy + r * 0.08} width={80} height={22} rx="11" fill={`${mainColor}20`} stroke={`${mainColor}60`} strokeWidth="1" />
      <text x={cx} y={cy + r * 0.08 + 11} textAnchor="middle" dominantBaseline="middle" fill={mainColor} fontSize="10" fontFamily="Space Mono" fontWeight="bold">
        {isInSpec ? "IN-SPEC" : value > targetMax ? "OVER-SPEC" : "UNDER-SPEC"}
      </text>

      {/* Target range label */}
      <text x={cx} y={cy + r * 0.08 + 38} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="Space Mono">
        TARGET: {targetMin}–{targetMax}
      </text>
    </svg>
  );
}
