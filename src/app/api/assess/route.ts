import { runAssessment } from "@/lib/pipeline";
import type { AssessEvent, CompanyProfile, Place } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { profile, place } = (await req.json()) as { profile: CompanyProfile; place: Place };
  if (!profile?.industry || !place?.label) {
    return Response.json({ error: "Company profile and location are required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AssessEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runAssessment(profile, place, send);
      } finally {
        send({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
