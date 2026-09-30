"use client";

import { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/types";
import { Spinner } from "./ui";

export default function LocationSearch({ onSelect, disabled }: { onSelect: (p: Place) => void; disabled?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);
  const latest = useRef(0);
  const chosen = useRef<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (chosen.current === query) return;
    chosen.current = null;
    setResults([]);
    setOpen(false);
    if (q.length < 3) {
      setResults([]);
      setEmpty(false);
      return;
    }
    // Debounced to respect the free geocoder's ~1 request/second policy.
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/place?list=1&q=${encodeURIComponent(q)}`);
        const body = res.ok ? ((await res.json()) as Place[]) : [];
        if (id !== latest.current) return;
        setResults(body);
        setEmpty(body.length === 0);
        setActive(0);
        setOpen(true);
      } finally {
        if (id === latest.current) setLoading(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = (p: Place) => {
    onSelect(p);
    const text = p.displayName ?? p.label;
    chosen.current = text;
    setQuery(text);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") setActive((a) => (a + 1) % results.length);
    else if (e.key === "ArrowUp") setActive((a) => (a - 1 + results.length) % results.length);
    else if (e.key === "Enter") choose(results[active]);
    else if (e.key === "Escape") setOpen(false);
    else return;
    e.preventDefault();
  };

  return (
    <div ref={box} className="relative">
      <div className="flex items-center rounded-lg border border-slate-200 bg-white transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
        <svg viewBox="0 0 20 20" className="ml-2.5 h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="9" r="6" />
          <path d="m14 14 4 4" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKey}
          placeholder="Town, postcode, address or “lat, lng”"
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-slate-900 outline-none disabled:cursor-not-allowed"
          role="combobox"
          aria-expanded={open}
          aria-controls="location-results"
          aria-autocomplete="list"
        />
        {loading && <Spinner className="mr-2.5 h-3.5 w-3.5 text-slate-400" />}
        {!loading && query && (
          <button
            type="button"
            onClick={() => (setQuery(""), setResults([]), setOpen(false))}
            className="mr-1.5 rounded px-1.5 text-slate-400 hover:text-slate-700"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {open && (results.length > 0 || empty) && (
        <ul
          id="location-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {empty && <li className="px-3 py-2 text-[12.5px] text-slate-500">No UK locations match “{query.trim()}”.</li>}
          {results.map((p, i) => (
            <li
              key={`${p.lat},${p.lng},${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => (e.preventDefault(), choose(p))}
              className={`cursor-pointer px-3 py-2 ${i === active ? "bg-indigo-50" : ""}`}
            >
              <div className="truncate text-[13px] font-medium text-slate-900">{p.displayName?.split(",").slice(0, 2).join(",") ?? p.label}</div>
              <div className="truncate text-[11.5px] text-slate-500">
                {p.localAuthority} · {p.nation}
                {p.postcode && ` · ${p.postcode}`} · {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
