import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Output, generateText } from "ai";
import type { z } from "zod";

// Deployed build uses the Gemini API with an API key, because Vertex authenticates through
// Application Default Credentials, which is a developer credential and does not exist on a
// server. Same models, different door. Set GEMINI_API_KEY and optionally GEMINI_TEXT_MODEL.
const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
});
const textModel = () => google(process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash");

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
