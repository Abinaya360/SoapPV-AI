"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Zap, Settings2, BarChart3, Activity, FlaskConical
} from "lucide-react";

const NAV = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/prediction", icon: Zap, label: "Prediction" },
  { href: "/optimization", icon: Settings2, label: "Optimization" },
  { href: "/analytics", icon: BarChart3, label: "Model Analytics" },
  { href: "/monitoring", icon: Activity, label: "Quality Monitor" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-60 min-h-screen bg-card border-r border-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9">
            <div className="absolute inset-0 bg-primary/20 rounded-lg blur-sm" />
            <div className="relative bg-primary/10 border border-primary/30 rounded-lg w-9 h-9 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-primary" />
            </div>
          </div>
          <div>
            <div className="font-mono text-sm font-bold text-foreground leading-tight">SoapPV-AI</div>
            <div className="text-xs text-muted-foreground font-mono">v1.0.0</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        <div className="text-xs font-mono text-muted-foreground px-4 py-2 uppercase tracking-widest">Navigation</div>
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = path === href;
          return (
            <Link key={href} href={href} className={`sidebar-link ${active ? "active" : ""}`}>
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
              {active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Status footer */}
      <div className="p-4 border-t border-border">
        <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground">MODEL</span>
            <span className="text-xs font-mono text-primary">XGBoost</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground">R²</span>
            <span className="text-xs font-mono text-green-400">0.9105</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground">TARGET</span>
            <span className="text-xs font-mono text-foreground">3.8–4.2</span>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400 font-mono">Model Active</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
