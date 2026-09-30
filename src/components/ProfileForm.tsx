"use client";

import type { CompanyProfile } from "@/lib/types";

export const DEFAULT_PROFILE: CompanyProfile = {
  companyName: "",
  industry: "",
  headquarters: "",
};

const FIELDS: { key: keyof CompanyProfile; label: string; placeholder: string }[] = [
  { key: "companyName", label: "Company name", placeholder: "e.g. Northwind Cloud" },
  { key: "industry", label: "Industry", placeholder: "e.g. Hyperscale cloud provider" },
  { key: "headquarters", label: "Headquarters", placeholder: "e.g. Seattle, United States" },
];

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

export default function ProfileForm({ value, onChange }: { value: CompanyProfile; onChange: (p: CompanyProfile) => void }) {
  return (
    <div className="grid gap-3">
      {FIELDS.map((f) => (
        <label key={f.key} className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-500">{f.label}</span>
          <input className={input} value={value[f.key]} placeholder={f.placeholder} onChange={(e) => onChange({ ...value, [f.key]: e.target.value })} />
        </label>
      ))}
    </div>
  );
}
