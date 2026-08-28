import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
    - Use \\( ... \\) for inline math and \\[ ... \\] for display math when helpful.
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
  return stripReasoning(text);
}

/** Fallback: Google Gemini (same model as solve route) */
async function askGemini(body: AskStepRequestBody): Promise<string> {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
  const result = await model.generateContent(buildPrompt(body));
  const text = result.response.text();

  if (!text) throw new Error("Empty response from Gemini");
  return stripReasoning(text);
}

/**
 * Step Q&A endpoint with automatic failover:
 * 1. Try Groq (qwen3.6-27b) — same model as /api/solve
 * 2. On any error, fall back to Gemini (3.5-flash) — same as /api/solve
 * 3. If both fail, return structured error
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
    } catch (groqErr: any) {
      console.warn("[ask-step] Groq failed:", groqErr.message);
    }

    // --- Attempt 2: Gemini ---
    try {
      console.log("[ask-step] Falling back to Gemini (3.5-flash)...");
      const answer = await askGemini(body);
      console.log("[ask-step] Gemini fallback succeeded");
      return NextResponse.json({ answer });
    } catch (geminiErr: any) {
      console.error("[ask-step] Gemini fallback failed:", geminiErr.message);
    }

    return NextResponse.json(
      { error: "Both answer providers failed. Please try again later." },
      { status: 502 },
    );
  } catch (error: any) {
    console.error("Ask step API unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error: " + error.message },
      { status: 500 },
    );
  }
}