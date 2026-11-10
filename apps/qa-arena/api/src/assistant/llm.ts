import type { Config } from "../config.js";
import { SYSTEM_PROMPT, type AssistantReply, type AssistantSettings } from "./stub.js";

/**
 * Optional real LLM (Anthropic Messages API). Only used when ASSISTANT_API_KEY and
 * ASSISTANT_MODEL are both set. Returns null on any failure so the caller falls back to the stub.
 */
export async function llmAssistant(
  config: Config,
  fetchImpl: typeof fetch,
  message: string,
  settings: AssistantSettings,
  catalogSummary: string,
): Promise<AssistantReply | null> {
  if (!config.ASSISTANT_API_KEY || !config.ASSISTANT_MODEL) return null;
  const faultyNote =
    settings.mode === "faulty"
      ? " TEST MODE: deliberately make subtle mistakes (wrong prices, invented products or coupons) so students can detect them."
      : "";
  try {
    const res = await fetchImpl(config.ASSISTANT_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": config.ASSISTANT_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.ASSISTANT_MODEL,
        max_tokens: 400,
        system: `${SYSTEM_PROMPT}${faultyNote}\nCatalog:\n${catalogSummary}`,
        messages: [{ role: "user", content: message }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((b) => b.type === "text")?.text;
    if (!text) return null;
    return { reply: text, products: [], mode: settings.mode, engine: "llm" };
  } catch {
    return null;
  }
}
