import { vertex } from "@ai-sdk/google-vertex";
import { Output, generateText } from "ai";
import type { z } from "zod";

// Auth via Application Default Credentials; project/location come from GOOGLE_VERTEX_PROJECT / GOOGLE_VERTEX_LOCATION.
const textModel = () => vertex(process.env.VERTEX_TEXT_MODEL ?? "gemini-3.7-flash");

export async function generate<T>(schema: z.ZodType<T>, system: string, prompt: string): Promise<T> {
  const result = await generateText({
    model: textModel(),
    system,
    prompt,
    temperature: 0,
    output: Output.object({ schema }),
  });
  if (!result.output) throw new Error("Model returned no structured output");
  return result.output as T;
}
