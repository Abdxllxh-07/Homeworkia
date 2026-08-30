/**
 * Shared sanitizer for model output.
 *
 * Some models (notably Gemini fallback) occasionally leak chain-of-thought /
 * self-verification narration into step explanations ("Wait, let me re-check…",
 * "Let's double check…", re-derivations, etc.). This helper trims any
 * explanation at the first such marker so it's never shown as a finished
 * student-facing step. Universal: applies to every subject and every provider.
 */

/** Words/phrases where a step explanation crosses from "finished answer" into
 * "the model talking to itself / re-verifying". Anything from the first marker
 * onward is chopped, since it's never part of a clean explanation. */
export const COT_CUT_MARKERS = [
  "let me re-check",
  "let me recheck",
  "let me check",
  "let me re-read",
  "let me re read",
  "let me verify",
  "let me double",
  "let me re-calculate",
  "let me recalculate",
  "let me recalc",
  "let me review",
  "let me make sure",
  "let me confirm",
  "let me think",
  "wait, let me",
  "wait let me",
  "let's double check",
  "let's double-check",
  "let's verify",
  "let's check",
  "let's try a different",
  "let me try a different",
  "is it possible i made",
  "so the answer is",
  "the answer is correct",
  "the calculation is correct",
  "this leads to the same",
  "re-check the calculation",
  "regenerating response",
  "the calculation seems",
];

/** Cut an explanation at the first chain-of-thought marker. */
export function trimCot(explanation: string): string {
  const lower = explanation.toLowerCase();
  let best = explanation.length;
  for (const marker of COT_CUT_MARKERS) {
    const idx = lower.indexOf(marker);
    if (idx !== -1 && idx < best) best = idx;
  }
  if (best < explanation.length) {
    return explanation.slice(0, best).trim();
  }
  return explanation;
}

/** Apply the CoT trim to every step explanation in a SolveResult (in place-ish). */
export function sanitizeExplanations(result: {
  steps?: { explanation?: string }[];
}): void {
  if (!Array.isArray(result.steps)) return;
  for (const step of result.steps) {
    if (step.explanation) step.explanation = trimCot(step.explanation);
  }
}

/**
 * Pull a clean single "result" value out of the last step's math box. Only
 * returns a value when the last line ends in a lone "= <simple value>" with no
 * sentence text, so we never mangle non-numeric or prose answers.
 */
export function extractFinalValue(math: string): string | null {
  if (!math) return null;
  // Strip outer delimiters and environment wrappers.
  let m = math.trim();
  m = m.replace(/^\$\$/, "").replace(/\$\$$/, "");
  m = m.replace(/^\\\[/, "").replace(/\\\]$/, "");
  m = m.replace(/^\\\(/, "").replace(/\\\)$/, "");
  m = m.replace(/\\begin\{aligned\}/, "").replace(/\\end\{aligned\}/, "");
  m = m.replace(/\\begin\{align\*\}/, "").replace(/\\end\{align\*\}/, "").trim();

  // Take the last logical line.
  const lines = m
    .split(/\\\\/)
    .map((l) => l.trim())
    .filter(Boolean);
  const lastLine = lines[lines.length - 1] || m;

  // Must have exactly one "=", with text only AFTER it (the value).
  const eq = lastLine.lastIndexOf("=");
  if (eq === -1) return null;
  const before = lastLine.slice(0, eq).trim();
  const value = lastLine.slice(eq + 1).trim();
  if (!value) return null;

  // Reject if it's not a clean standalone value: no nested "=", no \text{...}
  // sentence, no leftover \begin/\end, no spaces+letters (prose).
  if (value.includes("=")) return null;
  if (value.includes("\\text{")) return null;
  if (/\\begin|\\end/.test(value)) return null;
  if (/\s[A-Za-zÀ-ž]{2,}/.test(value)) return null; // word after space = prose
  if (!/\\frac|\d|\\approx|\\sqrt|\\pi|\\mu|\\mathrm/.test(value)) return null;
  if (before.length > 40) return null; // left side should be short, not a sentence

  return value;
}

/**
 * Post-process a SolveResult so it displays consistently & cleanly:
 *  1. strip chain-of-thought narration from every step explanation, and
 *  2. if finalAnswer is purely mathematical (no \text{} prose) AND the last step
 *     clearly ends in "= <value>", make finalAnswer match that value so the
 *     answer box never contradicts the working-out.
 * Universal for all subjects. Runs on both new solves (server) and on load of
 * saved answers (client) so old bad data also gets cleaned up.
 */
export function sanitizeResult<T extends {
  finalAnswer?: string;
  steps?: { explanation?: string; mathFormula?: string }[];
}>(result: T): T {
  if (!result || typeof result !== "object") return result;
  const steps = (result.steps || []).map((step) => {
    const explanation = trimCot(step.explanation || "");
    // Backfill: LLMs sometimes emit a step WITHOUT a mathFormula (a purely
    // descriptive step, or a malformed response). An empty formula renders as
    // an invisible KaTeX box while the final-answer box still shows text —
    // which looks exactly like "the answer box didn't show the answer but the
    // final answer did". Promote the explanation into the formula slot so a
    // step NEVER renders as an empty box. (StepCard also guards client-side.)
    let mathFormula = step.mathFormula || "";
    if (!mathFormula.trim() && (explanation || "").trim()) {
      mathFormula = explanation;
    }
    return { ...step, explanation, mathFormula };
  });

  const last = steps[steps.length - 1];
  let finalAnswer = (result.finalAnswer || "").trim();
  // Only auto-correct purely mathematical answers (has math tokens, no \text{}).
  const finalIsPureMath =
    !finalAnswer.includes("\\text{") &&
    /\\[bx]?[\[\]]|\\frac|\\int|\^|_/.test(finalAnswer);
  if (finalIsPureMath && last?.mathFormula) {
    const fromLast = extractFinalValue(last.mathFormula);
    if (fromLast) finalAnswer = `\\[ ${fromLast} \\]`;
  }

  return { ...result, steps, finalAnswer };
}
