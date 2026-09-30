"use client";

import type { ReactNode } from "react";
import type { Source } from "@/lib/types";

export function riskBand(score: number) {
  if (score >= 75) return { label: "Severe", text: "text-red-700", bg: "bg-red-600", soft: "bg-red-50 text-red-700 ring-red-200", hex: "#dc2626" };
  if (score >= 50) return { label: "High", text: "text-orange-700", bg: "bg-orange-500", soft: "bg-orange-50 text-orange-700 ring-orange-200", hex: "#f97316" };
  if (score >= 25) return { label: "Moderate", text: "text-amber-700", bg: "bg-amber-400", soft: "bg-amber-50 text-amber-800 ring-amber-200", hex: "#f59e0b" };
  return { label: "Low", text: "text-emerald-700", bg: "bg-emerald-500", soft: "bg-emerald-50 text-emerald-700 ring-emerald-200", hex: "#10b981" };
}

export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

export const PRECEDENT_COLOR: Record<string, string> = {
  approved: "#059669",
  refused: "#dc2626",
  quashed: "#dc2626",
  withdrawn: "#64748b",
  pending: "#6366f1",
  "called-in": "#6366f1",
  appeal: "#6366f1",
};

export const SENTIMENT_STYLE: Record<string, string> = {
  positive: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  negative: "bg-red-50 text-red-700 ring-red-200",
  mixed: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}>{children}</span>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_1px_8px_rgba(15,23,42,0.03)] ${className}`}>{children}</div>;
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{children}</h3>
      {aside}
    </div>
  );
}

export function SourceChips({ ids, sources, max = 8 }: { ids: string[]; sources: Map<string, Source>; max?: number }) {
  if (!ids.length) return null;
  const shown = ids.slice(0, max);
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {shown.map((id) => {
        const s = sources.get(id);
        if (!s) return null;
        return (
          <a
            key={id}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            title={`${s.title} — ${s.platform}`}
            className="rounded bg-slate-100 px-1.5 py-px font-mono text-[10px] text-slate-600 hover:bg-indigo-100 hover:text-indigo-700"
          >
            {id}
          </a>
        );
      })}
      {ids.length > max && <span className="text-[10px] text-slate-400">+{ids.length - max}</span>}
    </span>
  );
}

export function Spinner({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}
