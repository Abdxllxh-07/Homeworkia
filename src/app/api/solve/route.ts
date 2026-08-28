import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SolveResult } from "@/types/solve";

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
  - \`finalAnswer\` MUST be the complete, explicit solution written out in LaTeX as a self-contained formula or expression (e.g. \\[ x = -1 \\quad \\text{or} \\quad x = 2 \\]). NEVER write "see steps", "shown above", references to steps, or any placeholder text in \`finalAnswer\`.
  - If the answer has multiple parts (e.g., part a, part b, part c), separate each part with a newline (\\n) so they render on separate lines.
  - In \`explanation\` and \`problemText\`, use \\\\( ... \\\\) for inline math and \\\\[ ... \\\\] for block math.
  - Beware: in a JSON string, write backslash-delimited LaTeX exactly as \\\\(, \\\\), \\\\[ and \\\\] (double-escaped so the JSON parses correctly).
  - Keep LaTeX clean and valid.
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
    temperature: 0.1,
    max_tokens: 4096,
    // Qwen3-family support 'none' to disable chain-of-thought.
    reasoning_effort: "none",
    });

  const text = completion.choices[0]?.message?.content || "";
  if (!text) throw new Error("Empty response from Groq");
  return parseJsonResponse(text);
}

/** Fallback: Google Gemini vision model */
async function tryGemini(imageBase64: string): Promise<SolveResult> {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const result = await model.generateContent([
    VISION_PROMPT,
    { inlineData: { data: base64Data, mimeType: "image/jpeg" } },
  ]);

  const text = result.response.text();
  if (!text) throw new Error("Empty response from Gemini");
  return parseJsonResponse(text);
}

/**
 * Solve endpoint with automatic failover:
 * 1. Try Groq (Qwen 3.6 27B)
 * 2. On any error, fall back to Gemini (3.5 Flash)
 * 3. If both fail, return structured error
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
      return NextResponse.json(result);
    } catch (groqErr: any) {
      console.warn("[solve] Groq failed:", groqErr.message);
      // Fall through to Gemini
    }

    // --- Attempt 2: Gemini ---
    try {
      console.log("[solve] Falling back to Gemini (3.5-flash)...");
      const result = await tryGemini(imageBase64);
      console.log("[solve] Gemini fallback succeeded");
      return NextResponse.json(result);
    } catch (geminiErr: any) {
      console.error("[solve] Gemini fallback failed:", geminiErr.message);
      // Fall through to final error
    }

    // --- Both failed ---
    return NextResponse.json(
      { error: "Both vision providers failed. Please try again later." },
      { status: 502 },
    );
  } catch (error: any) {
    console.error("Solve API unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error: " + error.message },
      { status: 500 },
    );
  }
}
