import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { cloudflareChatCompletion } from "@/lib/cloudflare";
import { trimCot } from "@/lib/sanitize";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

type AskStepRequestBody = {
  step: {
    stepNumber: number;
    title: string;
    explanation: string;
    mathFormula: string;
  };
  userQuestion: string;
  problemText: string;
  finalAnswer: string;
};

/** Shared prompt builder for both providers */
function buildPrompt(body: AskStepRequestBody): string {
  const { step, userQuestion, problemText, finalAnswer } = body;
  return `
    You are an expert math tutor. A student is working through this problem:

    **Problem:** ${problemText}
    **Final Answer:** ${finalAnswer}

    They are currently on step ${step.stepNumber} ("${step.title}"):
    **Explanation:** ${step.explanation}
    **Math:** ${step.mathFormula}

    **Student's Question:** "${userQuestion}"

    Respond with ONLY the direct answer to the student's question about this step.
    - Do NOT restate the problem, step number, or context.
    - Do NOT add greetings, intros, or sign-offs.
    - Do NOT include chain-of-thought, reasoning, or any internal thinking.
    - Use \\( ... \\) for inline math and $$ ... $$ for block math when helpful.
    - **Symbol Rule:** NEVER use raw Unicode symbols inside math (e.g. μ, α, β, ×, ÷, ≤, ≥, °, →). ALWAYS use the proper LaTeX command instead (e.g. \\mu, \\alpha, \\beta, \\times, \\div, \\leq, \\geq, ^{\\circ}, \\rightarrow).
    - **CRITICAL FORMATTING RULES:**
      * Math Delimiters: You MUST wrap all block/multi-line equations inside double dollar signs on their own lines. Never output naked LaTeX environments. Example:
        $$
        \\begin{aligned}
        x &= y \\\
        \\end{aligned}
        $$
      * Text Separation: Never use \\text{} inside math blocks to write full sentences, lists, or clinical steps. Write normal prose in standard Markdown outside of the $$ blocks.
      * Spacing: Always leave a blank empty line before and after any $$ block so the Markdown parser recognizes it.
      * NEVER output continuous horizontal equation chains on a single line (e.g., avoiding "A = B = C = D"). You MUST break long multi-step calculations vertically. Use multi-line LaTeX blocks like \\begin{aligned} ... \\end{aligned} and insert a newline \\\\ before every equals sign so the math stacks vertically.
    - Keep it concise (1-4 short sentences usually).
  `;
}

/** Strip reasoning / thinking blocks some models emit before the real answer. */
function stripReasoning(text: string): string {
  return (
    text
      // Qwen3 special tokens
      .replace(/<\|?thinking\|?>[\s\S]*?<\|?endofthinking\|?>/gi, "")
      .replace(/<\|?thought\|?>[\s\S]*?<\|?endofthought\|?>/gi, "")
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
      .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
      .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
      // "Let me think..." / "I'll..." preamble lines
      .replace(/^(let me|i['’]ll|first,? let|ok(ay)?,? let|alright,? let)[^\n]*\n+/gim, "")
      .trim()
  );
}

/** Primary: Groq (same model as solve route) */
async function askGroq(body: AskStepRequestBody): Promise<string> {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not set");

  const completion = await groq.chat.completions.create({
    model: "qwen/qwen3.6-27b",
    messages: [{ role: "user", content: buildPrompt(body) }],
    temperature: 0.2,
    // Qwen3-family support 'none' to disable chain-of-thought.
    reasoning_effort: "none",
  });

  const text = completion.choices[0]?.message?.content || "";
  if (!text) throw new Error("Empty response from Groq");
  return trimCot(stripReasoning(text));
}

/** Fallback: Google Gemini (same model as solve route) */
async function askGemini(body: AskStepRequestBody): Promise<string> {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
  const result = await model.generateContent(buildPrompt(body));
  const text = result.response.text();

  if (!text) throw new Error("Empty response from Gemini");
  return trimCot(stripReasoning(text));
}

/** Fallback 2: Cloudflare AI (Strictly qwen3.8-27b and gemini-3.7-flash only) */
async function askCloudflare(body: AskStepRequestBody): Promise<string> {
  const text = await cloudflareChatCompletion(
    [{ role: "user", content: buildPrompt(body) }],
    { temperature: 0.2, maxTokens: 2048, tag: "ask-step" },
  );
  return trimCot(stripReasoning(text));
}

/**
 * Step Q&A endpoint with automatic failover:
 * 1. Try Groq (qwen3.6-27b) — same model as /api/solve
 * 2. Fall back to Gemini (3.5-flash) — same as /api/solve
 * 3. Fall back to Cloudflare (qwen3.8-27b & gemini-3.7-flash)
 * 4. If all fail, return structured error
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AskStepRequestBody;

    if (!body.step || !body.userQuestion) {
      return NextResponse.json(
        { error: "Missing step or userQuestion." },
        { status: 400 },
      );
    }

    // --- Attempt 1: Groq ---
    try {
      console.log("[ask-step] Trying Groq (qwen3.6-27b)...");
      const answer = await askGroq(body);
      console.log("[ask-step] Groq succeeded");
      return NextResponse.json({ answer });
    } catch (groqErr) {
      const error = groqErr instanceof Error ? groqErr : new Error(String(groqErr));
      console.warn("[ask-step] Groq failed:", error.message);
    }

    // --- Attempt 2: Gemini ---
    try {
      console.log("[ask-step] Falling back to Gemini (3.5-flash)...");
      const answer = await askGemini(body);
      console.log("[ask-step] Gemini fallback succeeded");
      return NextResponse.json({ answer });
    } catch (geminiErr) {
      const error = geminiErr instanceof Error ? geminiErr : new Error(String(geminiErr));
      console.warn("[ask-step] Gemini fallback failed:", error.message);
    }

    // --- Attempt 3: Cloudflare (qwen3.8-27b & gemini-3.7-flash only) ---
    try {
      console.log("[ask-step] Falling back to Cloudflare third failsafe...");
      const answer = await askCloudflare(body);
      console.log("[ask-step] Cloudflare third failsafe succeeded");
      return NextResponse.json({ answer });
    } catch (cfErr) {
      const error = cfErr instanceof Error ? cfErr : new Error(String(cfErr));
      console.error("[ask-step] Cloudflare third failsafe failed:", error.message);
    }

    return NextResponse.json(
      { error: "All answer providers (Groq, Gemini, Cloudflare) failed. Please try again later." },
      { status: 502 },
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Ask step API unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error: " + err.message },
      { status: 500 },
    );
  }
}