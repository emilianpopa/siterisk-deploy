# SiteRisk

Data centre siting risk for the UK. Pick a location on the map, and SiteRisk pulls local news and social media, the legal framework and planning precedents, then uses Gemini on Vertex AI to score the risks, assess public sentiment and mobilisation, and build a prioritised action plan.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in the values
gcloud auth application-default login
npm run dev                  # http://localhost:3100
```

## Stack

- Next.js (App Router), React, Tailwind CSS
- Leaflet map with Esri basemap; OpenStreetMap Nominatim geocoding
- Firecrawl search for news, social media and web sources
- Vercel AI SDK with Google Vertex AI (`src/lib/llm.ts`)
