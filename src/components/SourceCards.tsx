"use client";

import { useState } from "react";
import type { Source } from "@/lib/types";

type Sentiment = "positive" | "neutral" | "negative";

const SENTIMENT_ACCENT: Record<Sentiment, { bar: string; dot: string; text: string; label: string }> = {
  positive: { bar: "border-l-emerald-500", dot: "bg-emerald-500", text: "text-emerald-700", label: "Supportive" },
  neutral: { bar: "border-l-slate-300", dot: "bg-slate-400", text: "text-slate-600", label: "Neutral" },
  negative: { bar: "border-l-red-500", dot: "bg-red-500", text: "text-red-700", label: "Opposed" },
};

const PLATFORMS: { match: RegExp; name: string; bg: string; glyph: string }[] = [
  { match: /reddit\.com/, name: "Reddit", bg: "bg-[#FF4500]", glyph: "r/" },
  { match: /(^|\.)x\.com|twitter\.com/, name: "X", bg: "bg-black", glyph: "𝕏" },
  { match: /facebook\.com/, name: "Facebook", bg: "bg-[#1877F2]", glyph: "f" },
  { match: /instagram\.com/, name: "Instagram", bg: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]", glyph: "IG" },
  { match: /youtube\.com/, name: "YouTube", bg: "bg-[#FF0000]", glyph: "▶" },
  { match: /linkedin\.com/, name: "LinkedIn", bg: "bg-[#0A66C2]", glyph: "in" },
  { match: /tiktok\.com/, name: "TikTok", bg: "bg-black", glyph: "♪" },
  { match: /mumsnet\.com/, name: "Mumsnet", bg: "bg-[#2E6A8E]", glyph: "M" },
  { match: /threads\.net/, name: "Threads", bg: "bg-black", glyph: "@" },
];

const PUBLISHERS: Record<string, string> = {
  "bbc.co.uk": "BBC News",
  "bbc.com": "BBC News",
  "theguardian.com": "The Guardian",
  "ft.com": "Financial Times",
  "thetimes.com": "The Times",
  "thetimes.co.uk": "The Times",
  "telegraph.co.uk": "The Telegraph",
  "independent.co.uk": "The Independent",
  "datacenterdynamics.com": "DCD",
  "gov.uk": "GOV.UK",
  "planningresource.co.uk": "Planning Resource",
  "techerati.com": "Techerati",
  "computerweekly.com": "Computer Weekly",
  "theregister.com": "The Register",
  "bucksherald.co.uk": "Bucks Herald",
  "bucksfreepress.co.uk": "Bucks Free Press",
  "oxfordmail.co.uk": "Oxford Mail",
  "northwaleschronicle.co.uk": "North Wales Chronicle",
  "foxglove.org.uk": "Foxglove",
  "cityam.com": "City A.M.",
  "reuters.com": "Reuters",
  "bloomberg.com": "Bloomberg",
  "standard.co.uk": "Evening Standard",
  "insidermedia.com": "Insider Media",
  "newcivilengineer.com": "New Civil Engineer",
  "constructionnews.co.uk": "Construction News",
};

function platformOf(s: Source) {
  return PLATFORMS.find((p) => p.match.test(s.platform)) ?? { name: s.platform, bg: "bg-slate-700", glyph: s.platform[0]?.toUpperCase() ?? "•" };
}

const publisherName = (host: string) => PUBLISHERS[host] ?? host;

const LEADING_DATE = /^((?:\d{1,2} \w{3,9},? \d{4})|(?:\w{3,9} \d{1,2},? \d{4})|(?:\d+ (?:minutes?|hours?|days?|weeks?|months?|years?) ago))\s*[·—–\-.]+\s*/i;

/** Search snippets often start with the post date; move it to the header. */
function splitDate(text: string, fallback?: string) {
  const m = text.match(LEADING_DATE);
  return m ? { date: fallback ?? m[1], text: text.slice(m[0].length) } : { date: fallback, text };
}

const favicon = (host: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;

/** Pulls author/community and post text out of the URL and search-result title. */
function parseSocial(s: Source) {
  let author = "";
  let text = s.snippet;
  let title = s.title.replace(/\s*[:\-|]\s*r\/\w+\s*$/i, "").replace(/\s*[-|]\s*(Reddit|Facebook|X|Instagram|YouTube|LinkedIn)\s*$/i, "").trim();

  const handleTitle = s.title.match(/^(.+?) \((@\w+)\)\s*(?:\/|on)\s*(?:X|Twitter)\s*$/i);
  if (handleTitle) {
    author = `${handleTitle[1]} · ${handleTitle[2]}`;
    title = "";
  }
  const onX = s.title.match(/^(.+?) on (?:X|Twitter):\s*["“](.+?)["”]?\s*(?:\/\s*X)?$/i);
  if (onX) {
    author = onX[1];
    title = "";
    text = onX[2].length > text.length ? onX[2] : text || onX[2];
  }

  try {
    const u = new URL(s.url);
    const path = u.pathname.split("/").filter(Boolean);
    if (/reddit\.com/.test(u.hostname) && path[0] === "r") author = `r/${path[1]}`;
    else if (/(x|twitter)\.com/.test(u.hostname) && path[0] && !author) author = `@${path[0]}`;
    else if (/facebook\.com/.test(u.hostname)) {
      const group = path[0] === "groups" ? path[1] : path[0];
      if (group && !/^\d+$/.test(group) && !["story.php", "permalink.php", "watch", "share"].includes(group)) {
        author = decodeURIComponent(group).replace(/[-_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      }
    } else if (/(x|twitter)\.com/.test(u.hostname) && path[0] && author && !author.includes("@")) {
      author = `${author} · @${path[0]}`;
    }
  } catch {
    // malformed URL — fall back to title-derived fields
  }

  const dated = splitDate(text, s.date);
  text = dated.text;
  if (title && text.toLowerCase().startsWith(title.toLowerCase().slice(0, 40))) title = "";
  return { author: author || platformOf(s).name, title, text, date: dated.date };
}

function SentimentTag({ sentiment }: { sentiment?: Sentiment }) {
  if (!sentiment) return null;
  const a = SENTIMENT_ACCENT[sentiment];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${a.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
      {a.label}
    </span>
  );
}

export type Scope = "local" | "regional" | "national";

const SCOPE_STYLE: Record<Scope, { label: string; cls: string }> = {
  local: { label: "Local", cls: "bg-indigo-600 text-white" },
  regional: { label: "Regional", cls: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200" },
  national: { label: "Elsewhere in UK", cls: "bg-slate-100 text-slate-500" },
};

function ScopeBadge({ scope }: { scope?: Scope }) {
  if (!scope) return null;
  const x = SCOPE_STYLE[scope];
  return <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold ${x.cls}`}>{x.label}</span>;
}

export function PlatformAvatar({ source, size = "h-8 w-8 text-[13px]" }: { source: Source; size?: string }) {
  if (source.kind !== "social") {
    return (
      <span className={`grid shrink-0 place-items-center rounded-full bg-white ring-1 ring-slate-200 ${size}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={favicon(source.platform)} alt="" className="h-1/2 w-1/2 rounded-sm" />
      </span>
    );
  }
  const p = platformOf(source);
  return <span className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${p.bg} ${size}`}>{p.glyph}</span>;
}

export function SocialPostCard({ source, sentiment, stance, scope }: { source: Source; sentiment?: Sentiment; stance?: string; scope?: Scope }) {
  const { author, title, text, date } = parseSocial(source);
  const platform = platformOf(source);
  const accent = sentiment ? SENTIMENT_ACCENT[sentiment].bar : "border-l-slate-200";
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      className={`group flex flex-col rounded-xl border border-l-[3px] border-slate-200 ${accent} bg-white p-3.5 transition hover:-translate-y-px hover:shadow-md`}
    >
      <div className="flex items-center gap-2.5">
        <PlatformAvatar source={source} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-slate-900">{author}</div>
          <div className="text-[11px] text-slate-500">
            {platform.name}
            {date && ` · ${date}`}
          </div>
        </div>
        <ScopeBadge scope={scope} />
      </div>
      {title && <div className="mt-2.5 text-[13px] font-semibold leading-snug text-slate-900 group-hover:text-indigo-700">{title}</div>}
      {text && <p className={`${title ? "mt-1" : "mt-2.5"} line-clamp-4 text-[13px] leading-relaxed text-slate-700`}>{text}</p>}
      {stance && <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] leading-snug text-slate-600">{stance}</p>}
      <div className="mt-auto flex items-center justify-between pt-2.5 text-[11px]">
        <SentimentTag sentiment={sentiment} />
        <span className="text-slate-400 group-hover:text-indigo-700">
          <span className="mr-1.5 font-mono">{source.id}</span>View on {platform.name} ↗
        </span>
      </div>
    </a>
  );
}

function Thumb({ source }: { source: Source }) {
  const [failed, setFailed] = useState(false);
  if (!source.imageUrl || failed) {
    return (
      <div className="grid h-[84px] w-[84px] shrink-0 place-items-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={favicon(source.platform)} alt="" className="h-7 w-7 rounded opacity-80" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={source.imageUrl} alt="" onError={() => setFailed(true)} className="h-[84px] w-[84px] shrink-0 rounded-lg object-cover" referrerPolicy="no-referrer" />
  );
}

export function NewsCard({ source, sentiment, stance, scope }: { source: Source; sentiment?: Sentiment; stance?: string; scope?: Scope }) {
  const { date, text } = splitDate(source.snippet, source.date);
  return (
    <a href={source.url} target="_blank" rel="noreferrer" className="group flex gap-3.5 rounded-xl border border-slate-200 bg-white p-3 transition hover:-translate-y-px hover:shadow-md">
      <Thumb source={source} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={favicon(source.platform)} alt="" className="h-3.5 w-3.5 rounded-sm" />
          <span className="font-semibold text-slate-700">{source.kind === "reference" ? "Reference · " : ""}{publisherName(source.platform)}</span>
          {date && <span>· {date}</span>}
          <span className="ml-auto flex items-center gap-1.5">
            <ScopeBadge scope={scope} />
            <span className="font-mono text-slate-400">{source.id}</span>
          </span>
        </div>
        <h4 className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug text-slate-900 group-hover:text-indigo-700">{source.title}</h4>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-slate-600">{text}</p>
        {(sentiment || stance) && (
          <div className="mt-1.5 flex items-baseline gap-2">
            <SentimentTag sentiment={sentiment} />
            {stance && <span className="truncate text-[11.5px] text-slate-500">{stance}</span>}
          </div>
        )}
      </div>
    </a>
  );
}

export function WebRow({ source, sentiment, scope }: { source: Source; sentiment?: Sentiment; stance?: string; scope?: Scope }) {
  return (
    <a href={source.url} target="_blank" rel="noreferrer" className="group flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={favicon(source.platform)} alt="" className="mt-0.5 h-4 w-4 shrink-0 rounded-sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-slate-800 group-hover:text-indigo-700">{source.title}</span>
          <ScopeBadge scope={scope} />
        </div>
        <p className="line-clamp-1 text-[12px] text-slate-500">{source.snippet}</p>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
          <span className="font-mono">{source.id}</span>
          <span>{source.platform}</span>
          <span className="capitalize">· {source.purpose}</span>
          {sentiment && (
            <>
              · <SentimentTag sentiment={sentiment} />
            </>
          )}
        </div>
      </div>
    </a>
  );
}
