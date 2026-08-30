/**
 * Shared Cloudflare Workers AI client (OpenAI-compatible endpoint).
 *
 * Cloudflare's Workers AI OpenAI-compatible endpoint REQUIRES the account ID in
 * the URL path:  /client/v4/accounts/{ACCOUNT_ID}/ai/v1/chat/completions
 * The old code called  /client/v4/ai/v1/chat/completions  which returns
 * "No route for that URI" (error 7000). This module fixes that.
 *
 * Load the account ID from `CLOUDFLARE_ACCOUNT_ID` in .env.local. If it's
 * missing we throw a descriptive error so the failover chain reports clearly.
 */

export type CloudflareMessage = {
  role: "user" | "assistant" | "system";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

/** Strictly allowed Cloudflare models only. */
export const ALLOWED_CLOUDFLARE_MODELS = ["qwen3.8-27b", "gemini-3.7-flash"] as const;

function getAccountId(): string {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!id || typeof id !== "string" || id.trim() === "") {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID is not set. Add it to .env.local — it goes in the API URL path: " +
        "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions. " +
        "Find it in the Cloudflare dashboard under Workers AI → Use REST API (or on any zone overview page).",
    );
  }
  return id.trim();
}

/**
 * Call the Cloudflare Workers AI OpenAI-compatible chat completions endpoint,
 * trying each allowed model in order. Returns the model response text.
 * @param messages OpenAI-style messages (text and/or image_url content).
 * @param temperature Sampling temperature.
 * @param maxTokens Max tokens for the completion.
 * @param seed Optional deterministic seed (where the model supports it) so the
 *        same image+prompt reproducer returns the same answer.
 * @param tag Log label (e.g. "solve" or "ask-step").
 */
export async function cloudflareChatCompletion(
  messages: CloudflareMessage[],
  opts: { temperature?: number; maxTokens?: number; seed?: number; tag?: string } = {},
): Promise<string> {
  const apiKey = process.env.CLOUDFLARE_API_KEY;
  if (!apiKey) throw new Error("CLOUDFLARE_API_KEY not set");

  const accountId = getAccountId();
  const { temperature = 0.2, maxTokens = 2048, seed, tag = "cloudflare" } = opts;
  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;

  let lastError: Error | null = null;

  for (const model of ALLOWED_CLOUDFLARE_MODELS) {
    try {
      console.log(`[${tag}] Trying Cloudflare model (${model})...`);
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          ...(seed !== undefined ? { seed } : {}),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || "";
        if (text) {
          console.log(`[${tag}] Cloudflare (${model}) succeeded`);
          return text;
        }
      } else {
        const errText = await res.text();
        throw new Error(`Cloudflare API error (${res.status}): ${errText}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.warn(`[${tag}] Cloudflare (${model}) failed:`, error.message);
      lastError = error;
    }
  }

  throw lastError || new Error("All allowed Cloudflare models failed");
}
