"use client";

import katex from "katex";
import { Fragment } from "react";

type MathTextProps = {
  children: string;
  display?: boolean;
  className?: string;
};

/** KaTeX silently drops raw Unicode Greek/math glyphs in math mode.
 *  Convert them to their LaTeX command equivalents so they actually render. */
const UNICODE_TO_LATEX: Record<string, string> = {
  // Lowercase Greek
  "α": "\\alpha", "β": "\\beta", "γ": "\\gamma", "δ": "\\delta",
  "ε": "\\epsilon", "ζ": "\\zeta", "η": "\\eta", "θ": "\\theta",
  "ι": "\\iota", "κ": "\\kappa", "λ": "\\lambda", "μ": "\\mu",
  "ν": "\\nu", "ξ": "\\xi", "π": "\\pi", "ρ": "\\rho",
  "σ": "\\sigma", "τ": "\\tau", "υ": "\\upsilon", "φ": "\\phi",
  "χ": "\\chi", "ψ": "\\psi", "ω": "\\omega", "ϑ": "\\vartheta",
  "ϕ": "\\varphi", "ϱ": "\\varrho", "ς": "\\varsigma",
  // Uppercase Greek
  "Γ": "\\Gamma", "Δ": "\\Delta", "Θ": "\\Theta", "Λ": "\\Lambda",
  "Ξ": "\\Xi", "Π": "\\Pi", "Σ": "\\Sigma", "Υ": "\\Upsilon",
  "Φ": "\\Phi", "Ψ": "\\Psi", "Ω": "\\Omega",
  // Operators & relations
  "×": "\\times", "÷": "\\div", "±": "\\pm", "∓": "\\mp",
  "≠": "\\neq", "≤": "\\leq", "≥": "\\geq", "≈": "\\approx",
  "≡": "\\equiv", "∝": "\\propto", "∞": "\\infty",
  "∑": "\\sum", "∏": "\\prod", "∫": "\\int", "√": "\\sqrt",
  "∂": "\\partial", "∇": "\\nabla", "∈": "\\in", "∉": "\\notin",
  "⊂": "\\subset", "⊆": "\\subseteq", "∪": "\\cup", "∩": "\\cap",
  "∀": "\\forall", "∃": "\\exists", "∅": "\\emptyset",
  "→": "\\rightarrow", "←": "\\leftarrow", "↔": "\\leftrightarrow",
  "⇒": "\\Rightarrow", "⇐": "\\Leftarrow", "⇔": "\\Leftrightarrow",
  "·": "\\cdot", "…": "\\dots", "°": "^{\\circ}",
  "ℝ": "\\mathbb{R}", "ℕ": "\\mathbb{N}", "ℤ": "\\mathbb{Z}",
  "ℚ": "\\mathbb{Q}", "ℂ": "\\mathbb{C}",
};

const SUBSCRIPT_MAP: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};

// Superscript digits and signs: used to normalize 10⁻³ → 10^{-3}
const SUPERSCRIPT_MAP: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁻": "-", "⁺": "+", "ⁿ": "n", "ᵏ": "k", "ˣ": "x",
};

/** Common pseudo-commands the LLMs emit that KaTeX doesn't know. */
const PSEUDO_COMMANDS: Record<string, string> = {
  "\\pH": "\\text{pH}",
  "\\pOH": "\\text{pOH}",
  "\\pKa": "\\text{pKa}",
  "\\pKb": "\\text{pKb}",
};

/**
 * Detect whether a "math" string is actually mostly PROSE (a clinical list,
 * drug-dosage table, calculation walkthrough, contraindication list, etc.)
 * rather than a real formula. LLMs routinely stuff readable text + units into
 * `mathFormula`. Rendering that through KaTeX produces a long unbreakable
 * horizontal line that overflows the box on any screen (esp. mobile). We detect
 * it and render as readable, vertically-wrapping text with inline math instead.
 *
 * Heuristics (any strong signal => prose):
 *  - Several full alphabetic words (either bare in math mode, or inside
 *    \text{}/\mathrm{}), i.e. >= 3 words of length >= 4.
 *  - A measurement unit suffix (mg, kg, ml, mL, μg/mol etc.) repeated several
 *    times, which real formulas almost never have as bare text.
 *  - Multi-line content with the pattern of a heading word followed by " = "
 *    (e.g. "Concentration = 0.16 mg/mL") which is a calculation walkthrough.
 *
 * IMPORTANT: this deliberately returns FALSE whenever the string contains a
 * real LaTeX alignment environment (\begin{aligned}/\begin{align}/\begin{cases}
 * etc. plus a closing \end{...}). Those are REAL multi-line math — KaTeX renders
 * them correctly with the & alignment markers, and splitting them into prose
 * lines would break every `&`. (Prose never contains \begin{...}.)
 */
function isProseHeavy(math: string): boolean {
  const lines = math.split(/\n|\\\\/).filter((l) => l.trim().length > 0);

  // Real LaTeX alignment environment => real multi-line math; never prose.
  if (/\\begin\{aligned\}|\\(?:align|align\*|aligned|array|matrix|cases|gathered|split)\b/.test(math) &&
      /\\end\{[^}]*\}/.test(math)) {
    return false;
  }

  // 1) Words anywhere — bare in math mode OR inside \text{}/\mathrm{} — after
  //    dropping LaTeX command names themselves.
  const words =
    math
      .replace(/\\[a-zA-Z]+/g, " ")
      .match(/(?:\\text|\\mathrm|\\mbox|\\operatorname)\s*\{([^{}]*)\}|[A-Za-zÀ-ž]{2,}/g) || [];
  const longWords = words
    .map((w) => w.replace(/^\\(?:text|mathrm|mbox|operatorname)\s*\{/, "").replace(/\}$/, ""))
    .filter((w) => /[A-Za-zÀ-ž]/.test(w) && w.length >= 4);
  if (longWords.length >= 3) return true;

  // 2) Repeated measurement units (mg, kg, ml, μg, mmol, etc.) as a sign of a
  //    drug-dosage / clinical calculation rather than a pure formula.
  const units = math.match(/\b(?:mg|kg|g|mL|ml|L|μg|ug|µg|mmol|mol|mEq|IU|kg\/min|ml\/h|mg\/kg)\b/gi) || [];
  if (units.length >= 3) return true;

  // 3) Multi-line calculation-walkthrough pattern: a line with alphabetic
  //    prose heading plus " = " (e.g. "Concentration = 0.16 mg/mL" or
  //    "Vitesse SAP = 0.78 mg/h"). These are readable calcs, not formulas.
  //    Skip lines that still carry a dangling aligned-env marker (a lone
  //    "\begin{aligned}" or "&" tail fragment) — those belong to real math.
  if (lines.length >= 2) {
    const calcLines = lines.filter((l) => {
      if (l.includes("&") && !/\\text\{[^}]*&/.test(l)) return false;
      return (
        /[A-Za-zÀ-ž]{2,}/.test(l) &&
        /^\s*[A-Za-zÀ-ž][A-Za-zÀ-ž0-9 ()µμg/.]*\s*=\s*/.test(l)
      );
    });
    if (calcLines.length >= 2) return true;
  }

  return false;
}

/** Renders KaTeX for pure formulas, or mixed prose with \\( ... \\) / \\[ ... \\]. */
export function MathText({
  children,
  display = false,
  className = "",
}: MathTextProps) {
  const text = children.trim();

  /**
   * Clean messy LLM prose before tokenizing/render:
   *  - Literal "\n" (backslash + n) that the model emitted as a character
   *    instead of a real newline -> real newline.
   *  - Markdown bold `**text**` -> plain text (MathText does not render
   *    markdown, so strip the double-asterisk markers, not single ones which
   *    can be multiplication).
   *  - Double-backslash LaTeX (JSON-double-escaped `\\( x \\)`, `\\[ y \\]`,
   *    `\\frac`, `\\neq`) -> single backslash, so models that over-escaped
   *    still render instead of showing literal `\( n \neq 0 \)` text.
   * This is universal for all subjects (math/chem/phys/medical explain prose).
   */
  const normalizeProse = (str: string): string =>
    str
      // literal backslash-n -> real newline, ONLY when that \n is NOT the start
      // of a real LaTeX command (\neq, \ne) — a relationship, not a line break.
      // Without this guard, "\neq" gets mangled into "\" + newline + "eq"
      // which surfaces to the user as literal "n eq 0"-style text.
      .replace(/\\(?!ne(?:q)?\b)n/g, "\n")
      // collapse JSON-double-escaped delimiters \\\( \\\) \\\[ \\\] -> single
      .replace(/\\\\([()\[\]])/g, "\\$1")
      // collapse JSON-double-escaped LaTeX commands \\frac, \\neq -> single
      .replace(/\\\\([a-zA-Z]+)/g, "\\$1")
      // bold markers **x** -> x
      .replace(/\*\*(.+?)\*\*/g, "$1");

  // Robustly render KaTeX as HTML without ever crashing React
  const safeKaTeX = (math: string, isBlock: boolean) => {
    try {
      // LLMs sometimes paste "≠" (raw unicode) or "\neq" INSIDE \text{...}
      // ("\text{n ≠ 0}"). KaTeX cannot parse a relation inside \text{}; it
      // errors, and we'd degrade the WHOLE expression to raw text. Split those
      // text groups around the relation so the ≠ renders as real math.
      const repaired = repairTextRelations(math);
      const html = katex.renderToString(repaired, {
        displayMode: isBlock,
        throwOnError: false,
        strict: false,
      });
      // KaTeX injects red ".katex-error" spans when a formula fails to parse.
      // Those render as "undefined"/raw fragments and look broken. Degrade to
      // readable, wrapping plain text instead so nothing ever shows a red
      // error — the math may be imperfect but it is always fully readable.
      if (html.includes("katex-error")) {
        return (
          <span className="whitespace-pre-wrap break-words">{math}</span>
        );
      }
      return (
        <span
          className={
            isBlock
              ? "block my-2 overflow-x-auto max-w-full"
              : "inline-block align-middle max-w-full overflow-x-auto"
          }
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } catch (e) {
      console.error("KaTeX Error:", e);
      return <span className="whitespace-pre-wrap break-words">{math}</span>;
    }
  };

  // Convert raw Unicode math glyphs (μ, α, β, ×, ≤, etc.) into LaTeX commands
  // so KaTeX actually renders them instead of silently dropping them.
  // IMPORTANT: skip characters inside \\text{...} so prose is left intact.
  const simplifyMath = (str: string): string => {
    // Collapse any JSON-double-escaped LaTeX: "\\frac" -> "\frac",
    // "\\\\( ... \\\\)" -> "\( ... \)", so over-escaped models still render.
    // Use the SAME order + \neq-preserving rule as normalizeProse so "\\neq"
    // (or "\neq") never gets eaten as "\" + newline + "eq".
    const normalized = str
      .replace(/\\(?!ne(?:q)?\b)n/g, "\n")
      .replace(/\\\\([()\[\]])/g, "\\$1")
      .replace(/\\\\([a-zA-Z]+)/g, "\\$1");
    // Walk the string: when inside \text{...} or \mathrm{...}, don't convert.
    let out = "";
    let i = 0;
    let inText = false;
    let braceDepth = 0;
    while (i < normalized.length) {
      const ch = normalized[i];
      if (!inText) {
        // Detect pseudo-commands first so \pH -> \text{pH}
        const pseudo = /^\\(?:pH|pOH|pKa|pKb)\b/.exec(normalized.slice(i));
        if (pseudo) {
          out += PSEUDO_COMMANDS[pseudo[0]];
          i += pseudo[0].length;
          continue;
        }
        // Detect entering \text{ or \mathrm{ or \operatorname{
        const m = /^\\(?:text|mathrm|operatorname|mbox)\s*\{/.exec(normalized.slice(i));
        if (m) {
          inText = true;
          braceDepth = 1;
          out += m[0];
          i += m[0].length;
          continue;
        }
        // Normalize unicode subscripts "H₂O" -> "H_{2}O"
        if (SUBSCRIPT_MAP[ch]) {
          let run = "";
          let j = i;
          while (j < normalized.length && SUBSCRIPT_MAP[normalized[j]]) {
            run += str[j];
            j += 1;
          }
          out += `_{${run.split("").map((d) => SUBSCRIPT_MAP[d]).join("")}}`;
          i = j;
          continue;
        }
        // Normalize unicode superscripts "10⁻³" -> "10^{-3}"
        if (ch === "⁻" || SUPERSCRIPT_MAP[ch]) {
          let run = "";
          let j = i;
          while (j < normalized.length && (normalized[j] === "⁻" || normalized[j] === "⁺" || SUPERSCRIPT_MAP[normalized[j]])) {
            run += normalized[j];
            j += 1;
          }
          let sign = "";
          let digits = "";
          if (run[0] === "⁻" || run[0] === "⁺") {
            sign = run[0] === "⁻" ? "-" : "+";
            digits = run.slice(1).split("").map((d) => SUPERSCRIPT_MAP[d]).join("");
          } else {
            digits = run.split("").map((d) => SUPERSCRIPT_MAP[d]).join("");
          }
          out += `^{${sign}${digits}}`;
          i = j;
          continue;
        }
        if (UNICODE_TO_LATEX[ch]) {
          out += `${UNICODE_TO_LATEX[ch]} `;
          i += 1;
          continue;
        }
        out += ch;
        i += 1;
      } else {
        // Inside \text{...}: copy as-is, tracking braces.
        if (ch === "{") braceDepth += 1;
        else if (ch === "}") {
          braceDepth -= 1;
          if (braceDepth === 0) inText = false;
        }
        out += ch;
        i += 1;
      }
    }
    return out;
  };

  /**
   * Universal repair for math strings where the LLM put a RELATION ( \neq,
   * \ne, \not=, or a pasted unicode ≠ ) INSIDE a \text{...} group — e.g.
   * "\text{n ≠ 0}", "\text{a \neq b}". KaTeX cannot parse a relation command or
   * the unicode ≠ glyph inside \text{} (it errors), which makes safeKaTeX
   * degrade the WHOLE expression to raw visible text ("n eq 0" / "\text{...}").
   *
   * Fix: split the \text{} group around the relation so the relation renders as
   * real math (real ≠ glyph) and the surrounding words stay as text:
   *   "\text{n ≠ 0}"  -> "\text{n } \neq \text{0}"
   *   "\text{a \neq b}" -> "\text{a } \neq \text{b}"
   * This is fully universal (any subject/question) and only fires when a
   * relation actually appears inside text, so prose-only \text{} is untouched.
   */
  const repairTextRelations = (math: string): string => {
    // \text{...} / \mbox{...} groups WITHOUT nested braces (common case).
    const groupRe = /\\(?:text|mbox)\{([^{}]*)\}/g;
    let out = "";
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = groupRe.exec(math)) !== null) {
      out += math.slice(last, m.index);
      const inner = m[1];
      // Order matters: test the longer forms first so "\neq" isn't eaten as
      // "\ne" + "q". \not= is an alternate spelling LLMs use.
      const relRe = /\\not\\neq|\\not=|\u2260|\\neq|\\ne/g;
      // Manually walk the text group, toggling between plain-text segments and
      // the relations between them, building the split output:
      //   "\text{n ≠ 0 and m ≠ 2}" -> "\text{n } \neq \text{0 and m } \neq \text{2}"
      const rels: { index: number; word: string }[] = [];
      let rm: RegExpExecArray | null;
      while ((rm = relRe.exec(inner)) !== null) {
        rels.push({ index: rm.index, word: rm[0] });
      }
      if (rels.length === 0) {
        // No relation inside — leave the group untouched.
        out += m[0];
      } else {
        let cursor = 0;
        let built = "";
        for (let r = 0; r < rels.length; r++) {
          const rel = rels[r];
          const seg = inner.slice(cursor, rel.index).trim();
          if (seg) built += "\\text{" + seg + "} ";
          built += (rel.word === "\u2260" ? "\\neq" : rel.word) + " ";
          cursor = rel.index + rel.word.length;
        }
        const tail = inner.slice(cursor).trim();
        if (tail) built += "\\text{" + tail + "}";
        // strip trailing spaces where the tail was empty
        out += built.replace(/\\text\{\}\s*/g, "").replace(/\s+$/g, "");
      }
      last = m.index + m[0].length;
    }
    out += math.slice(last);
    return out;
  };

  /** Split mixed prose+math into tokens: math runs (delimited or bare \cmd{...}) and plain text runs. */
  const splitMixed = (str: string): { text: string; math: boolean }[] => {
    // Capture a full \begin{...} ... \end{...} environment as ONE math token,
    // so aligned/equation blocks never get fragmented (each & stays valid).
    const envRe = /\\begin\{[a-zA-Z*]+\}[\s\S]*?\\end\{[a-zA-Z*]+\}/g;

    // Regex matching:
    //  - \[ ... \] , \( ... \) , $$ ... $$ , $ ... $
    //  - a bare LaTeX command with a brace group: \frac{..}{..}, \mu, \text{..}, etc.
    const re =
      /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|\\[a-zA-Z]+\s*(?:\[[^\]]*\])?\s*\{[^{}]*\}(?:\s*\{[^{}]*\})?|\\[a-zA-Z]+)/g;
    const parts: { text: string; math: boolean }[] = [];
    let m: RegExpExecArray | null;

    // First pass: walk over environments. Between them, find the simple tokens.
    // Absorb an enclosing $$ / $ / \[ / \( wrapper (with optional whitespace)
    // into the env token so the wrapper never leaks as a lone visible "$"/"$$".
    const envMatches: { start: number; end: number; text: string }[] = [];
    let em: RegExpExecArray | null;
    while ((em = envRe.exec(str)) !== null) {
      let start = em.index;
      let end = em.index + em[0].length;
      const before = str.slice(0, start);
      const after = str.slice(end);
      // preceding wrapper: optional whitespace then $$ / $ / \[ / \(
      const pre = /(\s*)(?:\$\$|\$|\\\[|\\\()\s*$/.exec(before);
      if (pre) start -= pre[0].length;
      // following wrapper: optional whitespace then $$ / $ / \] / \)
      const post = /^\s*(?:\$\$|\$|\\\]|\\\))/.exec(after);
      if (post) end += post[0].length;
      envMatches.push({ start, end, text: str.slice(start, end).trim() });
    }

    let cursor = 0;
    for (const env of envMatches) {
      // Emit simple tokens between cursor and this env
      const between = str.slice(cursor, env.start);
      if (between) {
        let last2 = 0;
        while ((m = re.exec(between)) !== null) {
          const start = m.index;
          if (start > last2) parts.push({ text: between.slice(last2, start), math: false });
          parts.push({ text: m[0], math: true });
          last2 = start + m[0].length;
        }
        if (last2 < between.length) parts.push({ text: between.slice(last2), math: false });
      }
      parts.push({ text: env.text, math: true });
      cursor = env.end;
    }
    // Trailing simple tokens after the last env
    const remaining = str.slice(cursor);
    if (remaining) {
      let last2 = 0;
      while ((m = re.exec(remaining)) !== null) {
        const start = m.index;
        if (start > last2) parts.push({ text: remaining.slice(last2, start), math: false });
        parts.push({ text: m[0], math: true });
        last2 = start + m[0].length;
      }
      if (last2 < remaining.length) parts.push({ text: remaining.slice(last2), math: false });
    }

    // Fallback: if the env regex matched nothing, run the original single pass.
    if (envMatches.length === 0) {
      parts.length = 0;
      let last2 = 0;
      while ((m = re.exec(str)) !== null) {
        const start = m.index;
        if (start > last2) parts.push({ text: str.slice(last2, start), math: false });
        parts.push({ text: m[0], math: true });
        last2 = start + m[0].length;
      }
      if (last2 < str.length) parts.push({ text: str.slice(last2), math: false });
    }

    // If the string contains explicit inline/display math delimiters (\(..\),
    // \[..\], $$..$$), the delimiters ALREADY separate math from prose — so we
    // must NOT collapse the whole string into a single math block, even when the
    // surrounding text has no 2+ letter prose words (e.g. "<math> à <math>").
    // Rendering each delimited group separately keeps both sides intact.
    const hasExplicitDelims =
      str.includes("\\(") || str.includes("\\[") || str.includes("$$");

    // Merge adjacent text token + math token + text token when the *entire*
    // string looks like pure math (e.g. the mock: "x = 3 \quad \text{or} \quad x = -1/2").
    // In that case render the whole thing as one KaTeX block instead of fragmented tokens.
    const hasText = parts.some((p) => !p.math);
    if (!hasText) {
      return [{ text: str, math: true }];
    }

    // Group: if the whole non-math text has no real prose words, it's pure math
    // with \text{} / \quad spacing — render as a single KaTeX block.
    // BUT if explicit delimiters are present, skip this collapse (handled above).
    const textBits = parts.filter((p) => !p.math).map((p) => p.text).join(" ");
    const hasProseWord = /[A-Za-zÀ-ž]{2,}/.test(textBits);
    if (!hasExplicitDelims && !hasProseWord) {
      return [{ text: str, math: true }];
    }

    // Otherwise: merge *adjacent* math tokens and the short text fragments between
    // them (like " = ", "1.2 ", "10^{-5}") into single math runs, BUT keep any
    // fragment containing a 2+ letter alphabetic word as text.
    const merged: { text: string; math: boolean }[] = [];
    for (let idx = 0; idx < parts.length; idx++) {
      const part = parts[idx];
      if (part.math) {
        // Start a math run; absorb following text pieces that contain no prose word.
        // But if this token is a *closed delimiter* (\(..\) / \[..\] / $$..$$), never
        // absorb following text — the delimiter already delimits the math.
        const isClosed =
          (part.text.startsWith("\\(") && part.text.endsWith("\\)")) ||
          (part.text.startsWith("\\[") && part.text.endsWith("\\]")) ||
          (part.text.startsWith("$$") && part.text.endsWith("$$")) ||
          (part.text.startsWith("$") && part.text.endsWith("$") && part.text.length > 2);
        let run = part.text;
        if (!isClosed) {
          while (idx + 1 < parts.length && !parts[idx + 1].math) {
            const nextText = parts[idx + 1].text;
            // A differential tail (", dx", "\, dx", "\mathrm{d}x", " dt", ...)
            // is REAL math, even though "dx" matches the 2-letter-prose test.
            // If we drop it, the preceding run stays unbalanced (the \frac{..}
            // is missing its "}") and KaTeX errors + degrades to raw text.
            // "dx"/"dy"/"dt"/"du" are a safe tight set: real prose words are
            // longer or common English ("due", "da", "do" handled as words).
            // A lone "}" (or "} " + differential) is the closing brace of
            // the PREVIOUS math token, so requiring the fragment to END after
            // "}" ensures real prose like "} next formula" never gets absorbed.
            const isDifferentialTail =
              (/^\s*\\?\,?\s*(?:\\mathrm\{d\}|\\text\{d\}|[dD](?:x|y|z|t|u|v|r|s|θ|a|s|V))(?:\s|$)/.test(
                nextText
              )) ||
              /^\s*\}(?:\s*\\?\,?\s*[dD][A-Za-z](?:\s|$))?$/.test(nextText);
            const nextIsProse =
              isDifferentialTail
                ? false
                : /[A-Za-zÀ-ž]{2,}/.test(nextText);
            if (nextIsProse) break;
            run += nextText;
            idx += 1;
            // absorb any following math tokens too
            while (idx + 1 < parts.length && parts[idx + 1].math) {
              run += " " + parts[idx + 1].text;
              idx += 1;
            }
          }
        }
        merged.push({ text: run, math: true });
      } else {
        merged.push(part);
      }
    }

    return merged;
  };

  // ---- Display mode ----
  if (display) {
    let math = text;
    if (/^\\\[[\s\S]*\\\]$/.test(math)) math = math.slice(2, -2).trim();
    else if (/^\$\$[\s\S]*\$\$$/.test(math)) math = math.slice(2, -2).trim();

    // Multiple SEPARATE \begin{...}\end{...} blocks, or real prose sitting
    // OUTSIDE of a block (e.g. two \begin{aligned} blocks with "Comparing
    // this to ..., we identify ..." in between — a very common shape for
    // step-by-step derivations) are never one well-formed formula. Feeding
    // the whole thing into a single katex.renderToString call always fails
    // to parse (KaTeX chokes on the stray \( \) / English words) and falls
    // back to showing the raw LaTeX source as plain text. Detect that here
    // and delegate to the env-aware, prose-aware mixed renderer below
    // instead, which keeps each block intact while still rendering the
    // prose between them.
    const envBlockCount = (math.match(/\\begin\{[a-zA-Z*]+\}/g) || []).length;
    const outsideEnvText = math.replace(
      /\\begin\{[a-zA-Z*]+\}[\s\S]*?\\end\{[a-zA-Z*]+\}/g,
      " "
    );
    const hasProseOutsideEnv = /[A-Za-zÀ-ž]{4,}/.test(
      outsideEnvText.replace(/\\[a-zA-Z]+/g, " ")
    );
    if (envBlockCount > 1 || (envBlockCount === 1 && hasProseOutsideEnv)) {
      return (
        <div className={`mx-auto w-full max-w-full ${className}`}>
          <MathText>{math}</MathText>
        </div>
      );
    }

    // If this "display" content is actually prose (clinical lists, drug tables,
    // contraindications...), render it as readable, wrapping text with inline
    // math rather than one unbreakable KaTeX line. This universally fixes the
    // "text overflowing outside the box" bug for those subjects/questions.
    if (isProseHeavy(math)) {
      const lines = math
        .split(/\n|\\\\/)
        .map((l) => l.trim())
        .filter(Boolean);
      return (
        <div className={`mx-auto w-full max-w-full ${className}`}>
          {lines.map((line, i) => (
            <div
              key={i}
              className="w-full min-w-0 break-words leading-relaxed"
            >
              <MathText>{line}</MathText>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className={`mx-auto w-full max-w-full overflow-x-auto ${className}`}>
        {safeKaTeX(simplifyMath(math), true)}
      </div>
    );
  }

  // ---- Pure plain text (no math at all) ----
  // For non-display prose, clean literal "\n" and markdown "**" first, and
  // preserve real newlines so bullets/list items appear on their own lines.
  const cleanedProse = normalizeProse(text);
  if (!cleanedProse.includes("\\") && !cleanedProse.includes("$") && !cleanedProse.includes("\n")) {
    return <span className={className}>{cleanedProse}</span>;
  }

  // ---- Mixed prose + math ----
  // If this is a multi-line prose explanation, render each line separately
  // (so newlines and bullets actually break), recursively handling inline math.
  const proseLines = cleanedProse.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  // BUT: multi-line MATH BLOCKS must NOT be line-split — splitting them into
  // "$$" / "\text{...}" / "\end{aligned}" fragments makes KaTeX fail on each
  // piece and the raw delimiters/commands appear as literal text. Detect them
  // and keep them whole:
  //   1) $$...$$ or \[...\] wrapping a \begin{aligned} environment.
  //   2) A BARE \begin{...}...\end{...} environment — LLMs often omit the $$
  //      wrapper; the & alignment operators are only valid INSIDE the env, so
  //      fragmenting it breaks every line. (Prose never contains \begin{...}.)
  const containsEnv = /\\begin\{[a-zA-Z*]+\}/.test(cleanedProse);
  const isMultilineMathBlock =
    (cleanedProse.startsWith("$$") && cleanedProse.endsWith("$$")) ||
    (cleanedProse.startsWith("\\[") && cleanedProse.endsWith("\\]"));

  // Only split line-by-line when there's no \begin{...}\end{...} environment
  // anywhere in the text — an environment spans multiple lines (its "\\" row
  // separators and "&" alignment markers only make sense together), so naive
  // \n-splitting would shred it into unrenderable fragments. When an env IS
  // present, skip straight to splitMixed below: it already captures each
  // \begin...\end block as ONE atomic token and correctly interleaves it
  // with any surrounding prose/inline math, no matter how many separate
  // blocks or paragraphs are present.
  if (proseLines.length > 1 && !isMultilineMathBlock && !containsEnv) {
    return (
      <span className={`block space-y-1 ${className}`.trim()}>
        {proseLines.map((line, i) => (
          <span key={i} className="block min-w-0 break-words">
            <MathText>{line}</MathText>
          </span>
        ))}
      </span>
    );
  }

  // A multi-line math BLOCK ($$...$$ or \[...\]) is atomic — render it as a
  // single KaTeX display block (like display mode), never through splitMixed,
  // so an internal \begin{aligned}...\end{aligned} stays whole instead of
  // fragmenting into raw "$$" / "\text{...}" / "\end{aligned}" visible text.
  if (isMultilineMathBlock) {
    let math = cleanedProse;
    if (math.startsWith("$$") && math.endsWith("$$")) math = math.slice(2, -2).trim();
    else if (math.startsWith("\\[") && math.endsWith("\\]")) math = math.slice(2, -2).trim();
    // else: bare \begin{...}...\end{...} with no $$/\[ wrapper — leave as-is,
    // there is nothing to strip.
    return (
      <span className={`block my-2 overflow-x-auto max-w-full ${className}`.trim()}>
        {safeKaTeX(simplifyMath(math), true)}
      </span>
    );
  }

  const tokens = splitMixed(cleanedProse);

  return (
    <span className={className}>
      {tokens.map((token, index) => {
        if (!token.math) {
          return <span key={index}>{token.text}</span>;
        } 

        let math = token.text;
        let block = false;

        if (math.startsWith("\\[") && math.endsWith("\\]")) {
          math = math.slice(2, -2).trim();
          block = true;
        } else if (math.startsWith("\\(") && math.endsWith("\\)")) {
          math = math.slice(2, -2).trim();
        } else if (math.startsWith("$$") && math.endsWith("$$")) {
          math = math.slice(2, -2).trim();
          block = true;
        } else if (math.startsWith("$") && math.endsWith("$")) {
          math = math.slice(1, -1).trim();
        } else if (/(^|[^\\])\\begin\{[a-zA-Z*]+\}/.test(math)) {
          math=math.replace(/^(\$\$|\\\[|\\\()/, "").replace(/(\$\$|\\\]|\\\))$/, "").trim();
          block = true;
        } else if (PSEUDO_COMMANDS[math.trim()]) {
          // bare \pH etc -> \text{pH} as inline
          return (
            <Fragment key={index}>
              {safeKaTeX(PSEUDO_COMMANDS[math.trim()], false)}
            </Fragment>
          );
        }

        return <Fragment key={index}>{safeKaTeX(simplifyMath(math), block)}</Fragment>;
      })}
    </span>
  );
}
