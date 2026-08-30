import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SolveResult } from "@/types/solve";
import { cloudflareChatCompletion } from "@/lib/cloudflare";
import { sanitizeResult } from "@/lib/sanitize";

/**
 * Deterministic seed for image solves.
 *
 * LLM solves are stochastic: the same photo can legitimately produce different
 * (sometimes contradictory) answers across runs — especially when one attempt
 * hits Groq and another falls back to Gemini/Cloudflare (different models!).
 * Pinning a FIXED seed per image + temperature 0 makes each provider return
 * the same result for the same image, so re-solving the identical photo on
 * mobile vs PC gives the SAME answer instead of two confident-but-different
 * ones. (The seed isn't a hash of the image here because providers resolve
 * seeds against their own samplers; a constant per-image seed is still far
 * more stable than random sampling. Changing the photo changes the input, so
 * different questions still get different solves — determinism is per image
 * identity, which re-solving the same image needs.)
 */
function seedFor(imageBase64: string): number {
  // Simple stable FNV-1a hash of the image bytes -> integer seed.
  let hash = 0x811c9dc5;
  const str = imageBase64.slice(0, 8000); // image b64 preamble is enough
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/** Shared prompt for both providers */
const VISION_PROMPT = `
  You are an expert math tutor. Analyze the provided math problem image.
  1. Transcribe the problem into clear LaTeX.
  2. Solve the problem step-by-step.
  3. Return ONLY a valid JSON object with this structure:
  {
    "problemText": "Clean LaTeX version of the problem",
    "finalAnswer": "The final solution in LaTeX",
    "steps": [
      {
        "stepNumber": 1,
        "title": "Title of this step",
        "explanation": "Clear explanation of what to do in this step",
        "mathFormula": "The math transformation for this step in LaTeX"
      }
    ]
  }

  Rules:
  - finalAnswer MUST be the complete, explicit solution written out in LaTeX as a self-contained formula or expression (e.g. \\[ x = -1 \\quad \\text{or} \\quad x = 2 \\]). NEVER write "see steps", "shown above", references to steps, or any placeholder text in finalAnswer.
  - finalAnswer MUST EQUAL the final result obtained in the LAST step. Compute it exactly once, and keep it identical to your final step's conclusion. NEVER output an intermediate value, a different value, or a re-checked value that differs from your last step.
  - If the answer has multiple parts (e.g., part a, part b, part c), separate each part with a newline (\\n) so they render on separate lines.
  - In explanation and problemText, use \\\\( ... \\\\) for inline math and \\\\[ ... \\\\] for block math.
  - **NO CHAIN-OF-THOUGHT:** Each step's "explanation" MUST be a concise, finished explanation (1-4 short sentences) of the method, written as if presenting the completed step to a student. NEVER include self-checking, self-verification, or internal reasoning narration. FORBIDDEN wording: "Let me", "Let's", "Wait", "I'll", "Is it possible I made an error", "double check", "re-calculate", "re-read", "Let me verify", or any repeated re-derivations/trial of alternate methods. State the result once, cleanly, and stop. No filler like "The calculation is correct", "This leads to the same integral as before", or "So the answer is".
  - **NO REASONING MARKERS:** Do not emit any thinking/reasoning tags or first-person problem-solving narration anywhere in the JSON.
  - Beware: in a JSON string, write backslash-delimited LaTeX exactly as \\\\(, \\\\), \\\\[ and \\\\] (double-escaped so the JSON parses correctly).
  - Keep LaTeX clean and valid.
  - **Symbol Rule:** NEVER use raw Unicode symbols inside math (e.g. μ, α, β, ×, ÷, ≤, ≥, °, →). ALWAYS use the proper LaTeX command instead (e.g. \\mu, \\alpha, \\beta, \\times, \\div, \\leq, \\geq, ^{\\circ}, \\rightarrow).
  - **finalAnswer formatting:** Write each line of the final answer as short readable prose followed by inline math where needed. For example: "Part a: \\\\( x = 3 \\\\)" or "Final result: \\\\( \\mu = 1.2 \\\\times 10^{-5} \\\\)". Do NOT cram entire sentences into \\text{} — regular words belong outside math delimiters.
  - **CRITICAL FORMATTING RULE FOR MATH FORMULAS:**
    * Math Delimiters: You MUST wrap all block/multi-line equations inside double dollar signs on their own lines. Never output naked LaTeX environments. Example:
      $$
      \\begin{aligned}
      x &= y \\\
      \\end{aligned}
      $$
    * Text Separation: Never use \\text{} inside math blocks to write full sentences, lists, or clinical steps (e.g., avoid \\text{Hypotension : Traitee par...}). Write normal prose in standard Markdown outside of the $$ blocks.
    * Spacing: Always leave a blank empty line before and after any $$ block so the Markdown parser recognizes it.
    * NEVER output continuous horizontal equation chains on a single line (e.g., avoid "A = B = C = D"). You MUST break long multi-step calculations vertically. Use multi-line LaTeX blocks like \\begin{aligned} ... \\end{aligned} inside $$ ... $$ and insert a newline \\\\ before every equals sign so the math stacks vertically. For example:
      $$
      \\begin{aligned}
      f(x) &= x^2 + 2x + 1 \\\\
           &= (x+1)^2 \\\\
           &= x^2 + 2x + 1
      \\end{aligned}
      $$
`;

/** Strip thinking/reasoning blocks some models emit before the JSON. */
function stripReasoning(text: string): string {
  return (
    text
      .replace(/<\|?thinking\|?>[\s\S]*?<\|?endofthinking\|?>/gi, "")
      .replace(/<\|?thought\|?>[\s\S]*?<\|?endofthought\|?>/gi, "")
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
      .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
      .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
      .trim()
  );
}

/** Parse JSON from model response, handling markdown code fences */
function parseJsonResponse(text: string): SolveResult {
  const cleaned = stripReasoning(text);
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in response");
  return JSON.parse(match[0]);
}

/** Primary: Groq vision model */
async function tryGroq(imageBase64: string): Promise<SolveResult> {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");

  const completion = await groq.chat.completions.create({
    model: "qwen/qwen3.6-27b",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: VISION_PROMPT },
          { type: "image_url", image_url: { url: imageBase64 } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 4096,
    // Same image -> same seed -> same solve (deterministic re-solve).
    seed: seedFor(imageBase64),
    // Qwen3-family support 'none' to disable chain-of-thought.
    reasoning_effort: "none",
    });

  const text = completion.choices[0]?.message?.content || "";
  if (!text) throw new Error("Empty response from Groq");
  return sanitizeResult(parseJsonResponse(text));
}

/** Fallback: Google Gemini vision model */
async function tryGemini(imageBase64: string): Promise<SolveResult> {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { text: VISION_PROMPT },
          { inlineData: { data: base64Data, mimeType: "image/jpeg" } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      // Greedy decoding — this SDK has no seed field, so force topK=1
      // (argmax every token) for deterministic re-solves of the same image.
      topK: 1,
      topP: 1,
    },
  });

  const text = result.response.text();
  if (!text) throw new Error("Empty response from Gemini");
  return sanitizeResult(parseJsonResponse(text));
}

/** Fallback 2: Cloudflare AI (Strictly qwen3.8-27b and gemini-3.7-flash only) */
async function tryCloudflare(imageBase64: string): Promise<SolveResult> {
  const text = await cloudflareChatCompletion(
    [
      {
        role: "user",
        content: [
          { type: "text", text: VISION_PROMPT },
          { type: "image_url", image_url: { url: imageBase64 } },
        ],
      },
    ],
    { temperature: 0, seed: seedFor(imageBase64), maxTokens: 4096, tag: "solve" },
  );
  return sanitizeResult(parseJsonResponse(text));
}

/**
 * Solve endpoint with automatic failover:
 * 1. Try Groq (Qwen 3.6 27B)
 * 2. Fall back to Gemini (3.5 Flash)
 * 3. Fall back to Cloudflare (qwen3.8-27b & gemini-3.7-flash)
 * 4. If all fail, return structured error
 */
export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json();

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json(
        { error: "Missing imageBase64 string." },
        { status: 400 },
      );
    }

    // --- Attempt 1: Groq ---
    try {
      console.log("[solve] Trying Groq (qwen3.6-27b)...");
      const result = await tryGroq(imageBase64);
      console.log("[solve] Groq succeeded");
      return NextResponse.json({ ...result, provider: "groq" });
    } catch (groqErr) {
      const error = groqErr instanceof Error ? groqErr : new Error(String(groqErr));
      console.warn("[solve] Groq failed:", error.message);
      // Fall through to Gemini
    }

    // --- Attempt 2: Gemini ---
    try {
      console.log("[solve] Falling back to Gemini (3.5-flash)...");
      const result = await tryGemini(imageBase64);
      console.log("[solve] Gemini fallback succeeded");
      return NextResponse.json({ ...result, provider: "gemini" });
    } catch (geminiErr) {
      const error = geminiErr instanceof Error ? geminiErr : new Error(String(geminiErr));
      console.warn("[solve] Gemini fallback failed:", error.message);
      // Fall through to Cloudflare
    }

    // --- Attempt 3: Cloudflare (qwen3.8-27b & gemini-3.7-flash only) ---
    try {
      console.log("[solve] Falling back to Cloudflare third failsafe...");
      const result = await tryCloudflare(imageBase64);
      console.log("[solve] Cloudflare third failsafe succeeded");
      return NextResponse.json({ ...result, provider: "cloudflare" });
    } catch (cfErr) {
      const error = cfErr instanceof Error ? cfErr : new Error(String(cfErr));
      console.error("[solve] Cloudflare third failsafe failed:", error.message);
      // Fall through to final error
    }

    // --- All failed ---
    return NextResponse.json(
      { error: "All vision providers (Groq, Gemini, Cloudflare) failed. Please try again later." },
      { status: 502 },
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Solve API unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error: " + err.message },
      { status: 500 },
    );
  }
}
