"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { STEPS, STEP_LABELS, type AssessEvent, type CompanyProfile, type Place, type StepId } from "@/lib/types";
import LocationSearch from "./LocationSearch";
import ProfileForm, { DEFAULT_PROFILE } from "./ProfileForm";
import Results, { type AssessmentResult } from "./Results";
import { Card, PRECEDENT_COLOR, Spinner } from "./ui";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-slate-400">Loading map…</div>,
});

const PROFILE_KEY = "siterisk:profile:v1";
const PANEL_KEY = "siterisk:panel-width:v1";
const DEFAULT_PANEL = 640;
const MIN_PANEL = 380;
const MIN_MAP = 320;
const clampPanel = (w: number) => Math.round(Math.min(Math.max(MIN_PANEL, w), Math.max(MIN_PANEL, window.innerWidth - MIN_MAP)));

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked — saved preferences are a convenience, not critical
  }
}

type StepState = "idle" | "running" | "done" | "error";
const idleSteps = () => Object.fromEntries(STEPS.map((s) => [s, "idle"])) as Record<StepId, StepState>;

export default function App() {
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_PROFILE);
  const [profileOpen, setProfileOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [steps, setSteps] = useState(idleSteps);
  const [stepErrors, setStepErrors] = useState<Partial<Record<StepId, string>>>({});
  const [running, setRunning] = useState(false);
  const [panelW, setPanelW] = useState(DEFAULT_PANEL);
  const [dragging, setDragging] = useState(false);
  const lastResizeDown = useRef(0);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    const saved = load<CompanyProfile | null>(PROFILE_KEY, null);
    if (saved) {
      setProfile({ companyName: saved.companyName ?? "", industry: saved.industry ?? "", headquarters: saved.headquarters ?? "" });
      setProfileOpen(!saved.industry?.trim());
    }
    setPanelW(clampPanel(load<number>(PANEL_KEY, DEFAULT_PANEL)));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) save(PROFILE_KEY, profile);
  }, [profile, hydrated]);

  useEffect(() => {
    if (hydrated && !dragging) save(PANEL_KEY, panelW);
  }, [panelW, dragging, hydrated]);

  useEffect(() => {
    const onWindowResize = () => setPanelW((w) => clampPanel(w));
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, []);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const now = performance.now();
    if (now - lastResizeDown.current < 350) {
      lastResizeDown.current = 0;
      setPanelW(clampPanel(DEFAULT_PANEL));
      return;
    }
    lastResizeDown.current = now;
    setDragging(true);
    const move = (ev: PointerEvent) => setPanelW(clampPanel(window.innerWidth - ev.clientX));
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onResizeKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") setPanelW((w) => clampPanel(w + 40));
    else if (e.key === "ArrowRight") setPanelW((w) => clampPanel(w - 40));
    else return;
    e.preventDefault();
  };

  const toggleDone = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectPlace = (p: Place, fly: boolean) => {
    setPlace(p);
    setPin({ lat: p.lat, lng: p.lng });
    setLocError(null);
    if (fly) setFlyTarget({ lat: p.lat, lng: p.lng, zoom: 13 });
    setResult(null);
    setSteps(idleSteps());
    setStepErrors({});
  };

  const resolvePlace = async (url: string) => {
    setLocating(true);
    setLocError(null);
    try {
      const res = await fetch(url);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not identify that location");
      selectPlace(body as Place, false);
    } catch (e) {
      setLocError(e instanceof Error ? e.message : String(e));
      setPlace(null);
    } finally {
      setLocating(false);
    }
  };

  const onPick = (lat: number, lng: number) => {
    if (running) return;
    setPin({ lat, lng });
    resolvePlace(`/api/place?lat=${lat}&lng=${lng}`);
  };

  const run = async () => {
    if (!place) return;
    setResult({});
    setDone(new Set());
    setSteps(idleSteps());
    setStepErrors({});
    setRunning(true);
    setProfileOpen(false);

    const acc: AssessmentResult = {};
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile, place }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as AssessEvent;
          if (ev.type === "step") {
            setSteps((s) => ({ ...s, [ev.step]: ev.state }));
            if (ev.message) setStepErrors((m) => ({ ...m, [ev.step]: ev.message }));
          } else if (ev.type !== "done") {
            (acc as Record<string, unknown>)[ev.type] = ev.data;
            setResult({ ...acc });
          }
        }
      }
    } catch (e) {
      setStepErrors((m) => ({ ...m, sources: e instanceof Error ? e.message : String(e) }));
      setSteps((s) => ({ ...s, sources: s.sources === "done" ? "done" : "error" }));
    } finally {
      setRunning(false);
    }
  };

  const profileReady = profile.industry.trim().length > 0;
  const showSteps = running || Object.values(steps).some((s) => s === "error");

  return (
    <div className="flex h-dvh flex-col bg-slate-50 text-slate-900">
      <header className="relative z-[700] flex h-14 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 shadow-sm shadow-indigo-500/30">
            <svg viewBox="0 0 20 20" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 18s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" strokeLinejoin="round" />
              <circle cx="10" cy="8" r="2.2" />
            </svg>
          </div>
          <div>
            <div className="text-[15px] font-semibold leading-tight tracking-tight">SiteRisk</div>
            <div className="text-[11px] leading-tight text-slate-500">Data centre siting risk · United Kingdom</div>
          </div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 sm:flex">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Live news & social monitoring
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative h-[45vh] shrink-0 lg:h-auto lg:flex-1">
          <MapView selected={pin} flyTarget={flyTarget} onPick={onPick} precedents={result?.precedents?.precedents ?? []} />

          {!pin && (
            <div className="pointer-events-none absolute left-1/2 top-4 z-[500] -translate-x-1/2 rounded-full bg-slate-900/80 px-4 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur">
              Click the map, or search for a location in the panel
            </div>
          )}

          <div className="absolute bottom-6 left-3 z-[500] rounded-xl border border-slate-200/80 bg-white/90 p-2.5 text-[11px] text-slate-600 shadow-lg shadow-slate-900/5 backdrop-blur">
            <div className="mb-1 font-semibold text-slate-700">Precedent decisions</div>
            <div className="flex gap-2">
              {(["approved", "refused", "pending"] as const).map((s) => (
                <span key={s} className="flex items-center gap-1 capitalize">
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-dashed bg-white" style={{ borderColor: PRECEDENT_COLOR[s] }} />
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          aria-valuenow={panelW}
          tabIndex={0}
          title="Drag to resize · double-click to reset"
          onPointerDown={startResize}
          onKeyDown={onResizeKey}
          className={`group relative z-[600] hidden w-px shrink-0 cursor-col-resize bg-slate-200 outline-none lg:block ${dragging ? "bg-indigo-500" : "hover:bg-indigo-400 focus-visible:bg-indigo-500"}`}
        >
          <span className="absolute inset-y-0 -left-2 -right-2" />
          <span
            className={`absolute left-1/2 top-1/2 flex h-10 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-[3px] rounded-full border bg-white shadow-sm transition ${
              dragging ? "border-indigo-500" : "border-slate-300 group-hover:border-indigo-400"
            }`}
          >
            <span className="h-4 w-px bg-slate-400" />
            <span className="h-4 w-px bg-slate-400" />
          </span>
        </div>
        {dragging && <div className="fixed inset-0 z-[2000] cursor-col-resize select-none" />}

        <aside
          style={{ "--panel-w": `${panelW}px` } as React.CSSProperties}
          className="flex min-h-0 flex-1 flex-col bg-slate-50 lg:w-[var(--panel-w)] lg:flex-none"
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
            <div className="space-y-3 pt-4">
              <Card>
                <button onClick={() => setProfileOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                  <div className="flex items-center gap-3">
                    <StepBadge n={1} ok={profileReady} />
                    <div>
                      <div className="text-[13px] font-semibold">Company profile</div>
                      <div className="text-[12px] text-slate-500">
                        {[profile.companyName || "Unnamed", profile.industry || "industry not set", profile.headquarters].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-indigo-700">{profileOpen ? "Done" : "Edit"}</span>
                </button>
                {profileOpen && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    <ProfileForm value={profile} onChange={setProfile} />
                  </div>
                )}
              </Card>

              <Card className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <StepBadge n={2} ok={!!place} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">Candidate location</div>
                    <div className="truncate text-[12px] text-slate-500">
                      {locating ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Spinner className="h-3 w-3" /> Identifying planning authority…
                        </span>
                      ) : locError ? (
                        <span className="text-red-600">{locError}</span>
                      ) : place ? (
                        <>
                          {place.label}
                          <span className="text-slate-400">
                            {" "}
                            · {place.lat.toFixed(3)}, {place.lng.toFixed(3)}
                            {place.postcode && ` · ${place.postcode}`}
                          </span>
                        </>
                      ) : (
                        "Search below or click the map to choose a site"
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <LocationSearch onSelect={(p) => selectPlace(p, true)} disabled={running} />
                </div>
              </Card>

              <div className="flex items-center gap-3">
                <button
                  onClick={run}
                  disabled={!place || !profileReady || running || locating}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {running ? (
                    <>
                      <Spinner /> Assessing…
                    </>
                  ) : result?.risks ? (
                    "Re-assess with latest news & social"
                  ) : (
                    "Assess site risk"
                  )}
                </button>
              </div>
              {showSteps && (
                <Card className="px-4 py-3">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                        style={{ width: `${(STEPS.filter((s) => steps[s] === "done").length / STEPS.length) * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-medium tabular-nums text-slate-500">
                      {STEPS.filter((s) => steps[s] === "done").length}/{STEPS.length}
                    </span>
                  </div>
                  <ol className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                    {STEPS.map((s) => (
                      <li key={s} className="flex items-center gap-2 text-[12px]" title={stepErrors[s]}>
                        <StepIcon state={steps[s]} />
                        <span className={steps[s] === "idle" ? "text-slate-400" : steps[s] === "error" ? "text-red-600" : "text-slate-700"}>{STEP_LABELS[s]}</span>
                      </li>
                    ))}
                  </ol>
                  {Object.entries(stepErrors).map(([s, m]) => (
                    <p key={s} className="mt-2 text-[11px] text-red-600">
                      {STEP_LABELS[s as StepId]} failed: {m}
                    </p>
                  ))}
                </Card>
              )}
            </div>

            {result && (result.sources || result.risks) && (
              <div className="mt-5">
                <Results result={result} done={done} onToggleDone={toggleDone} />
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function StepBadge({ n, ok }: { n: number; ok: boolean }) {
  return (
    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${ok ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"}`}>
      {ok ? "✓" : n}
    </span>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "running") return <Spinner className="h-3 w-3 text-indigo-600" />;
  if (state === "done") return <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-emerald-500 text-[8px] text-white">✓</span>;
  if (state === "error") return <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-red-500 text-[8px] text-white">!</span>;
  return <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />;
}
