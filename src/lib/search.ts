import type { CompanyProfile, Place, Source } from "./types";

const SEARCH = "https://api.firecrawl.dev/v2/search";

type Purpose = Source["purpose"];
interface Query {
  q: string;
  sources: ("news" | "web")[];
  limit: number;
  purpose: Purpose;
  tbs?: string;
}

interface RawHit {
  title?: string;
  url?: string;
  snippet?: string;
  description?: string;
  date?: string;
  imageUrl?: string;
}

const SOCIAL = /(reddit\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|tiktok\.com|mumsnet\.com|nextdoor\.|youtube\.com|threads\.net|linkedin\.com)/i;

function platformOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

async function firecrawl(query: Query): Promise<Omit<Source, "id">[]> {
  const res = await fetch(SEARCH, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      query: query.q,
      sources: query.sources,
      limit: query.limit,
      location: "United Kingdom",
      country: "GB",
      ...(query.tbs ? { tbs: query.tbs } : {}),
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { data?: { news?: RawHit[]; web?: RawHit[] } };
  const rows = [
    ...(body.data?.news ?? []).map((r) => ({ ...r, isNews: true })),
    ...(body.data?.web ?? []).map((r) => ({ ...r, isNews: false })),
  ];
  return rows
    .filter((r) => r.url?.startsWith("http") && r.title)
    .map((r) => {
      const url = r.url!;
      const platform = platformOf(url);
      return {
        title: r.title!.trim(),
        url,
        snippet: (r.snippet ?? r.description ?? "").replace(/(^|\s)#{1,6}\s+/g, "$1").replace(/[*_]{2,}/g, "").replace(/\s+/g, " ").trim().slice(0, 600),
        date: r.date,
        imageUrl: r.imageUrl?.startsWith("http") ? r.imageUrl : undefined,
        kind: SOCIAL.test(url) ? "social" : r.isNews ? "news" : "web",
        platform,
        purpose: query.purpose,
      } as const;
    });
}

function buildQueries(profile: CompanyProfile, place: Place): Query[] {
  const where = place.locality && place.locality !== place.area ? `${place.locality} ${place.area}` : place.area;
  const area = place.area;
  const nation = place.nation;
  return [
    { q: `data centre ${where}`, sources: ["news"], limit: 8, purpose: "community" },
    { q: `${where} data centre campaign OR protest OR petition OR "public meeting"`, sources: ["news"], limit: 8, purpose: "community" },
    { q: `${area} residents oppose data centre`, sources: ["news"], limit: 6, purpose: "community" },
    { q: `${where} data centre action group OR campaign group OR objections`, sources: ["web"], limit: 5, purpose: "community" },
    { q: `${where} data centre site:reddit.com`, sources: ["web"], limit: 5, purpose: "community" },
    { q: `${area} data centre site:x.com`, sources: ["web"], limit: 4, purpose: "community" },
    { q: `${area} data centre site:facebook.com`, sources: ["web"], limit: 4, purpose: "community" },
    { q: `data centre withdrawn after local opposition council ${nation}`, sources: ["news"], limit: 6, purpose: "community" },
    { q: `${profile.industry} data centre backlash UK residents`, sources: ["news"], limit: 4, purpose: "community", tbs: "qdr:y" },
    { q: `data centre planning application ${area} approved OR refused`, sources: ["news", "web"], limit: 6, purpose: "precedent" },
    { q: `data centre planning refused appeal ${nation}`, sources: ["news"], limit: 5, purpose: "precedent" },
    { q: `${place.localAuthority} local plan policy data centre`, sources: ["web"], limit: 5, purpose: "legal" },
    { q: `data centre planning permission ${nation} NSIP nationally significant infrastructure requirements`, sources: ["web"], limit: 5, purpose: "legal" },
    { q: `data centre UK grid connection water abstraction environmental permit backup generators regulation`, sources: ["web"], limit: 4, purpose: "legal" },
  ];
}

export async function gatherSources(profile: CompanyProfile, place: Place): Promise<Source[]> {
  const searches = await Promise.allSettled(buildQueries(profile, place).map(firecrawl));

  const seen = new Set<string>();
  const out: Source[] = [];
  const push = (s: Omit<Source, "id"> | null) => {
    if (!s) return;
    const key = s.url.replace(/[?#].*$/, "").replace(/\/$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...s, id: `S${out.length + 1}` });
  };

  searches.forEach((r) => r.status === "fulfilled" && r.value.forEach(push));

  if (!out.length) {
    const firstError = searches.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    throw new Error(firstError ? String(firstError.reason?.message ?? firstError.reason) : "No sources found for this location");
  }
  return out;
}
