import type { Place } from "@/lib/types";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const HEADERS = { "user-agent": "SiteRisk-demo/0.1 (data centre risk prototype)", "accept-language": "en-GB" };

interface NominatimResult {
  lat: string;
  lon: string;
  display_name?: string;
  address?: Record<string, string>;
}

function toPlace(r: NominatimResult): Place | null {
  const a = r.address ?? {};
  if (a.country_code !== "gb") return null;
  const locality = a.town ?? a.city ?? a.village ?? a.suburb ?? a.hamlet ?? a.municipality ?? "";
  const authority = a.county ?? a.state_district ?? a.city ?? a.town ?? "";
  const area = authority || locality;
  return {
    lat: Number(r.lat),
    lng: Number(r.lon),
    label: [locality, authority !== locality ? authority : "", a.state].filter(Boolean).join(", "),
    locality: locality || area,
    area,
    localAuthority: authority ? (/(council|borough|district)/i.test(authority) ? authority : `${authority} Council`) : "local planning authority",
    nation: a.state ?? "England",
    postcode: a.postcode,
    displayName: r.display_name?.replace(/, United Kingdom$/, ""),
  };
}

const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

async function nominatim(url: string) {
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`Geocoder error ${res.status}`);
  return (await res.json()) as NominatimResult | NominatimResult[];
}

async function reverse(lat: number, lng: number) {
  const hit = (await nominatim(`${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=14&lat=${lat}&lon=${lng}`)) as NominatimResult;
  const place = toPlace(hit);
  return place && { ...place, lat, lng };
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  const list = params.get("list") === "1";

  try {
    if (!q) {
      const place = await reverse(Number(params.get("lat")), Number(params.get("lng")));
      if (!place) return Response.json({ error: "Please choose a location within the United Kingdom" }, { status: 422 });
      return Response.json(place);
    }

    const coords = q.match(COORDS);
    if (coords) {
      const place = await reverse(Number(coords[1]), Number(coords[2]));
      if (!place) return Response.json(list ? [] : { error: "Those coordinates are outside the United Kingdom" }, { status: list ? 200 : 422 });
      return Response.json(list ? [place] : place);
    }

    const hits = (await nominatim(`${NOMINATIM}/search?format=jsonv2&addressdetails=1&countrycodes=gb&limit=${list ? 6 : 1}&q=${encodeURIComponent(q)}`)) as NominatimResult[];
    const places = hits.map(toPlace).filter((p): p is Place => !!p);
    if (list) return Response.json(places);
    if (!places.length) return Response.json({ error: "No UK location matched that search" }, { status: 404 });
    return Response.json(places[0]);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Geocoder error" }, { status: 502 });
  }
}
