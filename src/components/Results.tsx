"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RISK_LABELS,
  overallScore,
  riskScore,
  type Action,
  type Compliance,
  type Requirement,
  type Community,
  type Legal,
  type Plan,
  type Precedents,
  type Risk,
  type RiskCategory,
  type Risks,
  type Source,
} from "@/lib/types";
import { NewsCard, PlatformAvatar, SocialPostCard, WebRow, type Scope } from "./SourceCards";
import { Card, signed, PRECEDENT_COLOR, Pill, SENTIMENT_STYLE, SectionTitle, SourceChips, riskBand } from "./ui";

export interface AssessmentResult {
  sources?: Source[];
  legal?: Legal;
  community?: Community;
  precedents?: Precedents;
  risks?: Risks;
  plan?: Plan;
}

export function projectRisk(risks: Risk[], actions: Action[], done: Set<string>) {
  const reduction = new Map<RiskCategory, number>();
  for (const a of actions) {
    if (!done.has(a.id)) continue;
    for (const m of a.mitigates) reduction.set(m.category, (reduction.get(m.category) ?? 0) + m.likelihoodReduction);
  }
  const perCategory = new Map(risks.map((r) => [r.category, riskScore(Math.max(1, r.likelihood - (reduction.get(r.category) ?? 0)), r.impact)]));
  return { overall: overallScore([...perCategory.values()]), perCategory };
}

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

const TRACK = {
  consent: { label: "Consent & legal", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
  technical: { label: "Design & engineering", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  sentiment: { label: "Public sentiment", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  "social-initiative": { label: "Social initiative", cls: "bg-pink-50 text-pink-700 ring-pink-200" },
  monitoring: { label: "Monitoring", cls: "bg-teal-50 text-teal-700 ring-teal-200" },
} as const;

function TrackPill({ track }: { track: Action["track"] }) {
  const t = TRACK[track] ?? TRACK.consent;
  return <Pill className={t.cls}>{t.label}</Pill>;
}

/** Highest-priority actions first; ties go to the action that removes the most impact-weighted likelihood. */
export function topActions(risks: Risk[], actions: Action[], n = 5) {
  const impact = new Map(risks.map((r) => [r.category, r.impact]));
  const weight = (a: Action) => a.mitigates.reduce((sum, m) => sum + m.likelihoodReduction * (impact.get(m.category) ?? 1), 0);
  const ranked = [...actions].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || weight(b) - weight(a));
  // Always surface how to shift public sentiment and a tangible social initiative, even if lower priority.
  const picks = new Set<Action>(
    (["sentiment", "social-initiative"] as const).map((t) => ranked.find((a) => a.track === t)).filter((a): a is Action => !!a),
  );
  for (const a of ranked) {
    if (picks.size >= n) break;
    picks.add(a);
  }
  return ranked.filter((a) => picks.has(a));
}

const TABS = [
  ["overview", "Overview"],
  ["sources", "News & social"],
  ["sentiment", "Sentiment"],
  ["themes", "Themes"],
  ["legal", "Legal framework"],
  ["precedents", "Precedents"],
  ["plan", "Action plan"],
] as const;
type Tab = (typeof TABS)[number][0];
const TAB_LABEL = Object.fromEntries(TABS) as Record<Tab, string>;
const DEFAULT_ORDER = TABS.map(([id]) => id) as Tab[];
const TAB_ORDER_KEY = "siterisk:tab-order:v1";

function loadTabOrder(): Tab[] {
  try {
    const saved = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) ?? "null") as Tab[] | null;
    if (saved && saved.length === DEFAULT_ORDER.length && DEFAULT_ORDER.every((t) => saved.includes(t))) return saved;
  } catch {
    // unreadable or blocked storage — fall back to the default order
  }
  return DEFAULT_ORDER;
}

function saveTabOrder(order: Tab[]) {
  try {
    localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(order));
  } catch {
    // order just won't persist
  }
}

export default function Results({
  result,
  done,
  onToggleDone,
}: {
  result: AssessmentResult;
  done: Set<string>;
  onToggleDone: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [order, setOrder] = useState<Tab[]>(DEFAULT_ORDER);
  const [dragging, setDragging] = useState<Tab | null>(null);
  const [dropAt, setDropAt] = useState<{ id: Tab; after: boolean } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const updateEdges = useCallback(() => {
    const el = navRef.current;
    if (el) setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    updateEdges();
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    // Let a vertical mouse wheel scroll the tab row sideways.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [updateEdges]);
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [tab, order]);
  useEffect(() => setOrder(loadTabOrder()), []);

  const updateOrder = (next: Tab[]) => {
    setOrder(next);
    saveTabOrder(next);
  };
  const moveTab = (id: Tab, target: Tab, after: boolean) => {
    if (id === target) return;
    const rest = order.filter((t) => t !== id);
    const at = rest.indexOf(target) + (after ? 1 : 0);
    updateOrder([...rest.slice(0, at), id, ...rest.slice(at)]);
  };
  const nudgeTab = (id: Tab, delta: number) => {
    const i = order.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    updateOrder(next);
  };
  const [overrides, setOverrides] = useState<Record<string, Compliance>>({});
  useEffect(() => setOverrides({}), [result.legal]);
  const setOverride = (id: string, value: Compliance | null) =>
    setOverrides((o) => {
      const next = { ...o };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });
  const sourceMap = useMemo(() => new Map((result.sources ?? []).map((s) => [s.id, s])), [result.sources]);

  const counts: Partial<Record<Tab, number | undefined>> = {
    legal: result.legal?.requirements.length,
    themes: result.community?.themes.length,
    precedents: result.precedents?.precedents.length,
    plan: result.plan?.actions.length,
    sources: result.sources?.length,
  };

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-5 mb-4 bg-slate-50/90 px-5 py-2 backdrop-blur">
        <div className="relative rounded-xl bg-slate-200/60">
        <nav
          ref={navRef}
          onScroll={updateEdges}
          className="no-scrollbar flex items-center gap-1 overflow-x-auto scroll-px-1 p-1"
          aria-label="Result sections"
        >
          {order.map((id) => (
            <button
              data-tab={id}
              key={id}
              draggable
              title="Drag to reorder · Alt + ←/→ to move"
              onClick={() => setTab(id)}
              onKeyDown={(e) => {
                if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
                e.preventDefault();
                nudgeTab(id, e.key === "ArrowLeft" ? -1 : 1);
              }}
              onDragStart={(e) => {
                setDragging(id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", id);
              }}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const after = e.clientX > rect.left + rect.width / 2;
                if (dropAt?.id !== id || dropAt.after !== after) setDropAt({ id, after });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && dropAt) moveTab(dragging, dropAt.id, dropAt.after);
                setDragging(null);
                setDropAt(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDropAt(null);
              }}
              className={`relative shrink-0 select-none rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition ${
                tab === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-white/60 hover:text-slate-800"
              } ${dragging === id ? "opacity-40" : ""}`}
            >
              {dropAt?.id === id && dragging !== id && (
                <span className={`pointer-events-none absolute inset-y-1 w-0.5 rounded-full bg-indigo-500 ${dropAt.after ? "-right-[3px]" : "-left-[3px]"}`} />
              )}
              {TAB_LABEL[id]}
              {counts[id] != null && (
                <span className={`ml-1.5 rounded-full px-1.5 py-px text-[10px] tabular-nums ${tab === id ? "bg-indigo-50 text-indigo-600" : "bg-slate-200/70 text-slate-500"}`}>
                  {counts[id]}
                </span>
              )}
            </button>
          ))}
        </nav>
          <div
            className={`pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-xl bg-gradient-to-r from-slate-200 to-transparent transition-opacity ${edges.left ? "opacity-100" : "opacity-0"}`}
          />
          <div
            className={`pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl bg-gradient-to-l from-slate-200 to-transparent transition-opacity ${edges.right ? "opacity-100" : "opacity-0"}`}
          />
        </div>
      </div>

      {tab === "overview" && <Overview result={result} goTo={setTab} />}
      {tab === "legal" && (result.legal ? <LegalView legal={result.legal} sources={sourceMap} overrides={overrides} onOverride={setOverride} /> : <Pending what="legal framework" />)}
      {tab === "sentiment" && (result.community ? <SentimentView c={result.community} sources={sourceMap} plan={result.plan} done={done} onToggle={onToggleDone} goTo={setTab} /> : <Pending what="sentiment" />)}
      {tab === "themes" && (result.community ? <ThemesView c={result.community} sources={sourceMap} /> : <Pending what="themes" />)}
      {tab === "precedents" && (result.precedents ? <PrecedentsView p={result.precedents} sources={sourceMap} /> : <Pending what="precedents" />)}
      {tab === "plan" &&
        (result.plan && result.risks ? (
          <PlanView plan={result.plan} risks={result.risks} legal={result.legal} community={result.community} done={done} onToggle={onToggleDone} />
        ) : (
          <Pending what="action plan" />
        ))}
      {tab === "sources" && (result.sources ? <SourcesView sources={result.sources} community={result.community} /> : <Pending what="sources" />)}
    </div>
  );
}

function Pending({ what }: { what: string }) {
  return <p className="py-10 text-center text-sm text-slate-400">The {what} will appear here once the assessment reaches it.</p>;
}

function GaugeMarker({ value, label, ring }: { value: number; label: string; ring: string }) {
  return (
    <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${value}%` }}>
      <div className={`h-4 w-4 rounded-full bg-white shadow ring-[3px] ${ring}`} />
      <div className="absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-slate-600">
        {label} {value}
      </div>
    </div>
  );
}

function Overview({
  result,
  goTo,
}: {
  result: AssessmentResult;
  goTo: (t: Tab) => void;
}) {
  const { risks, plan } = result;
  if (!risks) {
    const n = result.sources?.length ?? 0;
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-slate-400">The risk overview will appear here once the assessment reaches it.</p>
        {n > 0 && (
          <button
            onClick={() => goTo("sources")}
            className="mt-3 rounded-lg bg-indigo-50 px-3 py-1.5 text-[13px] font-medium text-indigo-700 hover:bg-indigo-100"
          >
            Browse the {n} news articles & social posts found →
          </button>
        )}
      </div>
    );
  }

  const band = riskBand(risks.overall);
  const top = plan ? topActions(risks.risks, plan.actions) : [];
  const projected = plan ? projectRisk(risks.risks, plan.actions, new Set(top.map((a) => a.id))) : null;
  const afterBand = riskBand(projected?.overall ?? risks.overall);
  const pointsRemoved = (a: Action) => {
    const after = projectRisk(risks.risks, plan?.actions ?? [], new Set([a.id])).perCategory;
    return risks.risks.reduce((sum, r) => sum + (r.score - (after.get(r.category) ?? r.score)), 0);
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-slate-100">
          <div className="p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">Overall risk now</div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className={`text-4xl font-semibold tracking-tight tabular-nums ${band.text}`}>{risks.overall}</span>
              <span className="text-sm text-slate-400">/100</span>
            </div>
            <Pill className={`mt-1.5 ${band.soft}`}>{band.label}</Pill>
          </div>
          <div className="bg-gradient-to-br from-emerald-50/60 to-white p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">After top {top.length || 5} actions</div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className={`text-4xl font-semibold tracking-tight tabular-nums ${projected ? afterBand.text : "text-slate-300"}`}>{projected?.overall ?? "–"}</span>
              <span className="text-sm text-slate-400">/100</span>
              {projected && projected.overall < risks.overall && (
                <span className="ml-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">−{risks.overall - projected.overall}</span>
              )}
            </div>
            {projected ? <Pill className={`mt-1.5 ${afterBand.soft}`}>{afterBand.label}</Pill> : <div className="mt-2 text-[12px] text-slate-400">Building action plan…</div>}
          </div>
        </div>
        <div className="px-4 pb-5 pt-2">
          <div className="relative h-2 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 via-60% to-red-500">
            <GaugeMarker value={risks.overall} label="Now" ring="ring-slate-900" />
            {projected && <GaugeMarker value={projected.overall} label="After" ring="ring-emerald-600" />}
          </div>
          <div className="mt-6 flex justify-between text-[10px] tabular-nums text-slate-400">
            {[0, 25, 50, 75, 100].map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
      </Card>

      <div>
        <SectionTitle
          aside={
            plan && (
              <button onClick={() => goTo("plan")} className="text-[11px] font-medium text-indigo-700 hover:underline">
                Full plan ({plan.actions.length}) →
              </button>
            )
          }
        >
          Top 5 actions
        </SectionTitle>
        {plan ? (
          <Card className="divide-y divide-slate-100">
            {top.map((a, i) => {
              const drop = pointsRemoved(a);
              return (
                <div key={a.id} className="flex gap-3 px-3 py-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[12px] font-bold text-white shadow-sm shadow-indigo-500/30">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[13px] font-semibold leading-snug text-slate-900">{a.title}</span>
                      <Pill className={`${PRIORITY_STYLE[a.priority]} shrink-0`}>{a.priority}</Pill>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-slate-500">
                      <TrackPill track={a.track} />
                      <span>
                        {a.owner} · {a.timeline}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {a.mitigates.map((m, j) => (
                        <Pill key={j} className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                          {RISK_LABELS[m.category]} −{m.likelihoodReduction}
                        </Pill>
                      ))}
                      {drop > 0 && (
                        <span className="ml-auto text-[11px] text-slate-500" title="Total score reduction across the risks this action mitigates">
                          −{drop} risk points
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
        ) : (
          <Card className="px-3 py-6 text-center text-[13px] text-slate-400">Building the action plan…</Card>
        )}
      </div>
    </div>
  );
}

const STAGE_ORDER = ["pre-application", "application", "pre-construction", "construction", "operation"] as const;
const STATUS_STYLE = {
  mandatory: "bg-slate-900 text-white ring-slate-900",
  likely: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  conditional: "bg-slate-100 text-slate-600 ring-slate-200",
};

const COMPLIANCE = {
  "non-compliant": { label: "Non-compliant", icon: "✕", pill: "bg-red-50 text-red-700 ring-red-200", bar: "bg-red-500", edge: "border-l-red-500", note: "bg-red-50/70 text-red-950" },
  uncertain: { label: "Uncertain", icon: "?", pill: "bg-amber-50 text-amber-800 ring-amber-200", bar: "bg-amber-400", edge: "border-l-amber-400", note: "bg-amber-50/70 text-amber-950" },
  compliant: { label: "Compliant", icon: "✓", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", bar: "bg-emerald-500", edge: "border-l-emerald-500", note: "bg-emerald-50/70 text-emerald-950" },
} as const;
const COMPLIANCE_ORDER = ["non-compliant", "uncertain", "compliant"] as const;

function LegalView({
  legal,
  sources,
  overrides,
  onOverride,
}: {
  legal: Legal;
  sources: Map<string, Source>;
  overrides: Record<string, Compliance>;
  onOverride: (id: string, value: Compliance | null) => void;
}) {
  const [filter, setFilter] = useState<Compliance | "all">("all");
  const statusOf = (r: Requirement) => overrides[r.id] ?? r.compliance;
  const counts = Object.fromEntries(COMPLIANCE_ORDER.map((c) => [c, legal.requirements.filter((r) => statusOf(r) === c).length])) as Record<Compliance, number>;
  const total = legal.requirements.length || 1;

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="text-[11px] font-medium text-slate-500">Consenting route</div>
        <div className="text-sm font-semibold text-slate-900">{legal.regime}</div>
        <div className="mt-2 text-[11px] font-medium text-slate-500">Decision-maker</div>
        <div className="text-sm text-slate-800">{legal.planningAuthority}</div>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-700">{legal.summary}</p>
      </Card>

      <Card className="p-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[13px] font-semibold text-slate-900">
            Compliance · {counts.compliant} of {legal.requirements.length} requirements met
          </div>
          <span className="text-[11px] text-slate-400">AI assessment · override per item</span>
        </div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100">
          {COMPLIANCE_ORDER.map((c) => (
            <div key={c} className={COMPLIANCE[c].bar} style={{ width: `${(counts[c] / total) * 100}%` }} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {(["all", ...COMPLIANCE_ORDER] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2 py-0.5 text-[11px] ${filter === f ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              {f === "all" ? `All ${legal.requirements.length}` : `${COMPLIANCE[f].label} ${counts[f]}`}
            </button>
          ))}
        </div>
      </Card>

      {STAGE_ORDER.map((stage) => {
        const reqs = legal.requirements.filter((r) => r.stage === stage && (filter === "all" || statusOf(r) === filter));
        if (!reqs.length) return null;
        return (
          <div key={stage}>
            <SectionTitle>{stage.replace("-", " ")}</SectionTitle>
            <div className="space-y-2">
              {reqs.map((r) => {
                const status = statusOf(r);
                const c = COMPLIANCE[status];
                const overridden = overrides[r.id] != null && overrides[r.id] !== r.compliance;
                return (
                  <Card key={r.id} className={`border-l-[3px] p-3 ${c.edge}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="mr-1.5 font-mono text-[10px] text-slate-400">{r.id}</span>
                        <span className="text-[13px] font-semibold text-slate-900">{r.title}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Pill className={STATUS_STYLE[r.status]}>{r.status}</Pill>
                        <label className={`relative inline-flex items-center rounded-full py-0.5 pl-2 pr-5 text-[11px] font-semibold ring-1 ring-inset ${c.pill}`}>
                          <span className="mr-1">{c.icon}</span>
                          {c.label}
                          <span className="pointer-events-none absolute right-1.5 text-[9px] opacity-60">▼</span>
                          <select
                            aria-label={`Compliance for ${r.title}`}
                            value={status}
                            onChange={(e) => onOverride(r.id, e.target.value === r.compliance ? null : (e.target.value as Compliance))}
                            className="absolute inset-0 cursor-pointer opacity-0"
                          >
                            {COMPLIANCE_ORDER.map((o) => (
                              <option key={o} value={o}>
                                {COMPLIANCE[o].label}
                                {o === r.compliance ? " (AI assessment)" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                    <div className="mt-0.5 text-[12px] text-slate-500">
                      {r.instrument} · {r.authority}
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700">{r.description}</p>
                    <p className={`mt-2 rounded-lg px-2.5 py-1.5 text-[12.5px] leading-relaxed ${c.note}`}>
                      <span className="font-semibold">{overridden ? "Set by you" : "AI assessment"}: </span>
                      {overridden ? `marked ${c.label.toLowerCase()}. AI assessed it as ${COMPLIANCE[r.compliance].label.toLowerCase()}: ` : ""}
                      {r.complianceNote}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>⏱ {r.typicalTimeline}</span>
                      <SourceChips ids={r.sourceIds} sources={sources} />
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {filter === "all" && legal.localPolicies.length > 0 && (
        <div>
          <SectionTitle>Local policy</SectionTitle>
          <div className="space-y-2">
            {legal.localPolicies.map((p, i) => (
              <Card key={i} className="p-3 text-[13px]">
                <div className="font-semibold text-slate-900">{p.name}</div>
                <p className="mt-1 text-slate-700">{p.summary}</p>
                <p className="mt-1 text-slate-600">
                  <span className="font-medium">Implication: </span>
                  {p.implication} <SourceChips ids={p.sourceIds} sources={sources} />
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const MOBILISATION_LEVELS = ["none", "latent", "emerging", "organised", "intense"] as const;
const LEVEL_COLOR = ["bg-slate-300", "bg-amber-300", "bg-amber-500", "bg-orange-500", "bg-red-600"];
const LEVEL_TEXT = ["text-slate-600", "text-amber-700", "text-amber-700", "text-orange-700", "text-red-700"];
const LEVEL_HINT: Record<string, string> = {
  none: "No visible campaign activity",
  latent: "Scattered concern, no organisation yet",
  emerging: "Early organising — meetings, groups forming",
  organised: "Named groups, petitions, formal objections",
  intense: "Mass mobilisation, political and legal pressure",
};
const MAGNITUDE_STYLE = {
  low: "bg-slate-100 text-slate-600 ring-slate-200",
  medium: "bg-amber-50 text-amber-800 ring-amber-200",
  high: "bg-red-50 text-red-700 ring-red-200",
};
const STANCE_STYLE = {
  oppose: "bg-red-50 text-red-700 ring-red-200",
  support: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  mixed: "bg-violet-50 text-violet-700 ring-violet-200",
};

function MobilisationCard({ m, sources }: { m: Community["mobilisation"]; sources: Map<string, Source> }) {
  const idx = Math.max(0, MOBILISATION_LEVELS.indexOf(m.level));
  return (
    <div>
      <SectionTitle>Community mobilisation</SectionTitle>
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className={`text-lg font-semibold capitalize ${LEVEL_TEXT[idx]}`}>{m.level}</div>
            <div className="text-[11px] text-slate-500">{LEVEL_HINT[m.level]}</div>
          </div>
          <div className="flex w-56 gap-1">
            {MOBILISATION_LEVELS.map((l, i) => (
              <div key={l} className="flex-1">
                <div className={`h-2 rounded-full ${i <= idx ? LEVEL_COLOR[idx] : "bg-slate-100"}`} />
                <div className={`mt-1 text-center text-[9.5px] capitalize ${i === idx ? "font-semibold text-slate-700" : "text-slate-400"}`}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-slate-700">{m.summary}</p>

        {m.groups.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Who is organising</div>
            {m.groups.map((g, i) => (
              <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[13px] font-semibold text-slate-900">{g.name}</span>
                  <Pill className={`${STANCE_STYLE[g.stance]} shrink-0 capitalize`}>{g.stance}</Pill>
                </div>
                <div className="mt-0.5 text-[12.5px] text-slate-600">{g.activity}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-slate-800">{g.scale}</span>
                  <SourceChips ids={g.sourceIds} sources={sources} max={4} />
                </div>
              </div>
            ))}
          </div>
        )}

        {m.signals.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Signals</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {m.signals.map((x, i) => (
                <div key={i} className="rounded-lg border border-slate-200 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">{x.type}</span>
                    <span className="text-[10px] text-slate-400">{x.scope === "national" ? "elsewhere in UK" : x.scope}</span>
                  </div>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-slate-700">
                    {x.detail} <SourceChips ids={x.sourceIds} sources={sources} max={3} />
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {m.designationsCited.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Designations cited</span>
            {m.designationsCited.map((d) => (
              <Pill key={d} className="bg-emerald-50 text-emerald-800 ring-emerald-200">
                {d}
              </Pill>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function SentimentActions({
  plan,
  themes,
  done,
  onToggle,
  goTo,
}: {
  plan?: Plan;
  themes: Community["themes"];
  done: Set<string>;
  onToggle: (id: string) => void;
  goTo: (t: Tab) => void;
}) {
  const groups = [
    { track: "sentiment" as const, title: "Influence the conversation", hint: "Engagement, communication and allies" },
    { track: "social-initiative" as const, title: "Social initiatives", hint: "Tangible benefits the community can feel" },
  ];
  const themeTitle = new Map(themes.map((t) => [t.id, t.title]));
  return (
    <div>
      <SectionTitle
        aside={
          plan && (
            <button onClick={() => goTo("plan")} className="text-[11px] font-medium text-indigo-700 hover:underline">
              Full action plan →
            </button>
          )
        }
      >
        What we can do
      </SectionTitle>
      {!plan ? (
        <Card className="px-3 py-6 text-center text-[13px] text-slate-400">Building the action plan…</Card>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const actions = plan.actions.filter((a) => a.track === g.track);
            return (
              <Card key={g.track} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[13px] font-semibold text-slate-900">{g.title}</div>
                    <div className="text-[11px] text-slate-500">{g.hint}</div>
                  </div>
                  <span className="shrink-0 whitespace-nowrap">
                    <TrackPill track={g.track} />
                  </span>
                </div>
                {actions.length === 0 ? (
                  <p className="mt-3 text-[12px] text-slate-400">No actions of this type in the plan.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-100">
                    {actions.map((a) => {
                      const isDone = done.has(a.id);
                      return (
                        <li key={a.id} className="flex gap-2.5 py-2.5">
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => onToggle(a.id)}
                            aria-label={`Mark "${a.title}" done`}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
                          />
                          <div className={`min-w-0 ${isDone ? "opacity-60" : ""}`}>
                            <div className={`text-[13px] font-semibold leading-snug text-slate-900 ${isDone ? "line-through" : ""}`}>{a.title}</div>
                            <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">{a.description}</p>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {a.owner} · {a.timeline}
                            </div>
                            {a.themeIds.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {a.themeIds.map((id) => (
                                  <Pill key={id} className="max-w-full bg-slate-50 text-slate-500 ring-slate-200">
                                    <span className="truncate">{themeTitle.get(id) ?? id}</span>
                                  </Pill>
                                ))}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SentimentView({
  c,
  sources,
  plan,
  done,
  onToggle,
  goTo,
}: {
  c: Community;
  sources: Map<string, Source>;
  plan?: Plan;
  done: Set<string>;
  onToggle: (id: string) => void;
  goTo: (t: Tab) => void;
}) {
  const [filter, setFilter] = useState<"all" | "positive" | "neutral" | "negative">("all");
  const n = c.sourceSentiments.length;
  const rows = c.sourceSentiments.filter((s) => filter === "all" || s.sentiment === filter);
  const pct = (v: number) => Math.round(v * 100);
  const sentimentOf = new Map(c.sourceSentiments.map((x) => [x.sourceId, x.sentiment]));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium text-slate-500">
              Net sentiment · {c.basis === "local" ? "local & regional sources" : `${n} sources incl. elsewhere in UK`}
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className={`text-3xl font-semibold tabular-nums ${c.score < 0 ? "text-red-700" : "text-emerald-700"}`}>{signed(c.score)}</span>
              <span className="text-sm font-medium text-slate-700">{c.label}</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
          <div className="bg-emerald-500" style={{ width: `${pct(c.mix.positive)}%` }} />
          <div className="bg-slate-300" style={{ width: `${pct(c.mix.neutral)}%` }} />
          <div className="bg-red-500" style={{ width: `${pct(c.mix.negative)}%` }} />
        </div>
        <div className="mt-1.5 flex gap-4 text-[11px] text-slate-600">
          <span>
            <b className="text-emerald-700">{pct(c.mix.positive)}%</b> supportive
          </span>
          <span>
            <b className="text-slate-600">{pct(c.mix.neutral)}%</b> neutral
          </span>
          <span>
            <b className="text-red-700">{pct(c.mix.negative)}%</b> opposed
          </span>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-slate-700">{c.summary}</p>
      </Card>

      <MobilisationCard m={c.mobilisation} sources={sources} />

      {c.riskTransmission.length > 0 && (
        <div>
          <SectionTitle>How sentiment moves the risk</SectionTitle>
          <Card className="divide-y divide-slate-100">
            {c.riskTransmission.map((t, i) => {
              const up = t.direction === "increases";
              return (
                <div key={i} className="flex gap-3 px-3 py-2.5">
                  <span
                    className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${up ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}
                  >
                    {up ? "▲" : "▼"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-slate-900">{t.mechanism}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Pill className="bg-white text-slate-600 ring-slate-200">{RISK_LABELS[t.riskCategory]}</Pill>
                      <Pill className={MAGNITUDE_STYLE[t.magnitude]}>
                        {up ? "Raises" : "Lowers"} · {t.magnitude}
                      </Pill>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
                      {t.evidence} <SourceChips ids={t.sourceIds} sources={sources} />
                    </p>
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      )}

      <SentimentActions plan={plan} themes={c.themes} done={done} onToggle={onToggle} goTo={goTo} />

      {c.keyVoices.length > 0 && (
        <div>
          <SectionTitle>Key voices</SectionTitle>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {c.keyVoices.map((v, i) => {
              const s = sources.get(v.sourceId);
              const sent = sentimentOf.get(v.sourceId);
              return (
                <a
                  key={i}
                  href={s?.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group relative flex flex-col rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 transition hover:shadow-md"
                >
                  <span className={`absolute right-3 top-1 font-serif text-5xl leading-none ${sent === "negative" ? "text-red-200" : sent === "positive" ? "text-emerald-200" : "text-slate-200"}`}>”</span>
                  <p className="relative pr-6 text-[14px] font-medium leading-snug text-slate-800">{v.text}</p>
                  <div className="mt-auto flex items-center gap-2 pt-3">
                    {s && <PlatformAvatar source={s} size="h-6 w-6 text-[10px]" />}
                    <div className="min-w-0 text-[11px] leading-tight">
                      <div className="truncate font-semibold text-slate-700">{v.who}</div>
                      <div className="truncate text-slate-400 group-hover:text-indigo-700">{s?.platform} ↗</div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <SectionTitle
          aside={
            <div className="flex gap-1">
              {(["all", "negative", "neutral", "positive"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-md px-2 py-0.5 text-[11px] capitalize ${filter === f ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
                >
                  {f === "positive" ? "supportive" : f === "negative" ? "opposed" : f}
                </button>
              ))}
            </div>
          }
        >
          What people are saying
        </SectionTitle>
        <SourceFeed
          items={rows.flatMap((r) => {
            const src = sources.get(r.sourceId);
            return src ? [{ source: src, sentiment: r.sentiment, stance: r.stance, scope: r.scope }] : [];
          })}
        />
      </div>
    </div>
  );
}

function ThemesView({ c, sources }: { c: Community; sources: Map<string, Source> }) {
  const max = Math.max(1, ...c.themes.map((t) => t.sourceIds.length));
  const [open, setOpen] = useState<string | null>(c.themes[0]?.id ?? null);
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-slate-500">Themes are clustered by the model from the collected articles and posts; each source is assigned to every theme it discusses.</p>
      {c.themes.map((t) => {
        const isOpen = open === t.id;
        return (
          <Card key={t.id}>
            <button onClick={() => setOpen(isOpen ? null : t.id)} className="w-full p-3 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-slate-900">{t.title}</span>
                <div className="flex shrink-0 gap-1">
                  <Pill className={SENTIMENT_STYLE[t.sentiment]}>{t.sentiment}</Pill>
                  <Pill className="bg-white text-slate-500 ring-slate-200">{RISK_LABELS[t.riskCategory]}</Pill>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${(t.sourceIds.length / max) * 100}%` }} />
                </span>
                <span className="text-[11px] tabular-nums text-slate-500">{t.sourceIds.length} sources</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-700">{t.description}</p>
            </button>
            {isOpen && t.sourceIds.length > 0 && (
              <ul className="space-y-1 border-t border-slate-100 px-3 py-2">
                {t.sourceIds.map((id) => {
                  const s = sources.get(id);
                  if (!s) return null;
                  return (
                    <li key={id} className="flex gap-2 text-[12px]">
                      <span className="font-mono text-[10px] leading-5 text-slate-400">{id}</span>
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-slate-700 hover:text-indigo-700">
                        {s.title} <span className="text-slate-400">· {s.platform}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function PrecedentsView({ p, sources }: { p: Precedents; sources: Map<string, Source> }) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-slate-700">{p.summary}</p>
      <p className="text-[11px] text-slate-400">Precedents are also plotted on the map as dashed rings (approximate positions).</p>
      {p.precedents.map((x, i) => (
        <Card key={i} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[13px] font-semibold text-slate-900">{x.name}</div>
              <div className="text-[12px] text-slate-500">
                {x.location} · {x.operator} · {x.year}
              </div>
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize text-white"
              style={{ background: PRECEDENT_COLOR[x.status] ?? "#64748b" }}
            >
              {x.status}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Decided by: {x.decisionBy}</div>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[13px] text-slate-700">
            {x.keyReasons.map((r, j) => (
              <li key={j}>{r}</li>
            ))}
          </ul>
          {x.advice.length > 0 && (
            <div className="mt-2.5 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Our advice to you</div>
              <ol className="mt-1 space-y-1">
                {x.advice.map((a, j) => (
                  <li key={j} className="flex gap-2 text-[13px] leading-snug text-slate-800">
                    <span className="mt-px text-indigo-500">→</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="mt-1.5 text-right">
            <SourceChips ids={x.sourceIds} sources={sources} />
          </div>
        </Card>
      ))}
    </div>
  );
}

const PRIORITY_STYLE = {
  critical: "bg-red-600 text-white ring-red-600",
  high: "bg-orange-50 text-orange-700 ring-orange-200",
  medium: "bg-amber-50 text-amber-800 ring-amber-200",
  low: "bg-slate-100 text-slate-600 ring-slate-200",
};

function PlanView({
  plan,
  risks,
  legal,
  community,
  done,
  onToggle,
}: {
  plan: Plan;
  risks: Risks;
  legal?: Legal;
  community?: Community;
  done: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [phase, setPhase] = useState<string>("all");
  const projected = projectRisk(risks.risks, plan.actions, done);
  const doneCount = plan.actions.filter((a) => done.has(a.id)).length;
  const reqs = new Map(legal?.requirements.map((r) => [r.id, r]) ?? []);
  const themes = new Map(community?.themes.map((t) => [t.id, t]) ?? []);
  const phases = STAGE_ORDER.filter((s) => plan.actions.some((a) => a.phase === s));
  const shown = plan.actions.filter((a) => phase === "all" || a.phase === phase);

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium text-slate-800">
            {doneCount} of {plan.actions.length} actions complete
          </span>
          <span className="text-slate-600">
            Risk <b className={riskBand(risks.overall).text}>{risks.overall}</b> →{" "}
            <b className={riskBand(projected.overall).text}>{projected.overall}</b>
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${(doneCount / Math.max(1, plan.actions.length)) * 100}%` }} />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Tick actions as they are completed — each one lowers the likelihood of the risks it mitigates and the projected score updates.</p>
      </Card>

      <div className="flex flex-wrap gap-1">
        {["all", ...phases].map((p) => (
          <button
            key={p}
            onClick={() => setPhase(p)}
            className={`rounded-md px-2 py-0.5 text-[11px] capitalize ${phase === p ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
          >
            {p.replace("-", " ")}
          </button>
        ))}
      </div>

      {shown.map((a) => {
        const isDone = done.has(a.id);
        return (
          <Card key={a.id} className={`p-3 transition ${isDone ? "opacity-60" : ""}`}>
            <div className="flex gap-3">
              <input type="checkbox" checked={isDone} onChange={() => onToggle(a.id)} className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-[13px] font-semibold text-slate-900 ${isDone ? "line-through" : ""}`}>{a.title}</span>
                  <Pill className={`${PRIORITY_STYLE[a.priority]} shrink-0`}>{a.priority}</Pill>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-700">{a.description}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                  <TrackPill track={a.track} />
                  <span>👤 {a.owner}</span>
                  <span>⏱ {a.timeline}</span>
                  <span className="capitalize">◷ {a.phase.replace("-", " ")}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {a.mitigates.map((m, i) => (
                    <Pill key={i} className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                      {RISK_LABELS[m.category]} −{m.likelihoodReduction}
                    </Pill>
                  ))}
                  {a.requirementIds.map((id) => (
                    <Pill key={id} className="bg-slate-50 text-slate-600 ring-slate-200">
                      <span title={reqs.get(id)?.title}>
                        {id} {reqs.get(id)?.title.slice(0, 32)}
                      </span>
                    </Pill>
                  ))}
                  {a.themeIds.map((id) => (
                    <Pill key={id} className="bg-violet-50 text-violet-700 ring-violet-200">
                      {themes.get(id)?.title ?? id}
                    </Pill>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

type FeedItem = { source: Source; sentiment?: "positive" | "neutral" | "negative"; stance?: string; scope?: Scope };

function FeedSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-[13px] font-semibold text-slate-800">{title}</h4>
        <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-medium tabular-nums text-slate-500">{count}</span>
      </div>
      {children}
    </section>
  );
}

const SCOPE_RANK: Record<string, number> = { local: 0, regional: 1, national: 2 };

function SourceFeed({ items: raw }: { items: FeedItem[] }) {
  const items = [...raw].sort((a, b) => (SCOPE_RANK[a.scope ?? ""] ?? 3) - (SCOPE_RANK[b.scope ?? ""] ?? 3));
  const social = items.filter((i) => i.source.kind === "social");
  const news = items.filter((i) => i.source.kind === "news" || i.source.kind === "reference");
  const web = items.filter((i) => i.source.kind === "web");
  if (!items.length) return <p className="py-6 text-center text-[13px] text-slate-400">Nothing in this view.</p>;
  return (
    <div className="space-y-5">
      <FeedSection title="Social media" count={social.length}>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {social.map((i) => (
            <SocialPostCard key={i.source.id} {...i} />
          ))}
        </div>
      </FeedSection>
      <FeedSection title="News coverage" count={news.length}>
        <div className="space-y-2">
          {news.map((i) => (
            <NewsCard key={i.source.id} {...i} />
          ))}
        </div>
      </FeedSection>
      <FeedSection title="Web, policy & planning documents" count={web.length}>
        <Card className="divide-y divide-slate-100">
          {web.map((i) => (
            <WebRow key={i.source.id} {...i} />
          ))}
        </Card>
      </FeedSection>
    </div>
  );
}

function SourcesView({ sources, community }: { sources: Source[]; community?: Community }) {
  const [kind, setKind] = useState<string>("all");
  const sentiment = new Map(community?.sourceSentiments.map((s) => [s.sourceId, s]) ?? []);
  const kinds = ["all", ...new Set(sources.map((s) => s.kind))];
  const shown = sources.filter((s) => kind === "all" || s.kind === kind);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {kinds.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-md px-2 py-0.5 text-[11px] capitalize ${kind === k ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              {k} <span className="opacity-60">{k === "all" ? sources.length : sources.filter((s) => s.kind === k).length}</span>
            </button>
          ))}
        </div>
      </div>
      <SourceFeed
        items={shown.map((s) => ({
          source: s,
          sentiment: sentiment.get(s.id)?.sentiment,
          stance: sentiment.get(s.id)?.stance,
          scope: sentiment.get(s.id)?.scope,
        }))}
      />
    </div>
  );
}
