"use client";

import { BlockMath, InlineMath } from "react-katex";
import { Fragment } from "react";

type MathTextProps = {
  children: string;
  display?: boolean;
  className?: string;
};

const MATH_FRAGMENT_RE =
  /(?:\\frac|\\dfrac|\\sqrt|\\sum|\\int|\\lim|\\log|\\ln|\\sin|\\cos|\\tan|\\pm|\\times|\\cdot|\\div|\\leq|\\geq|\\neq|\\approx|\\Rightarrow|\\rightarrow|\\alpha|\\beta|\\pi|\\infty|\\quad|\\mathbb|\\text|\\begin|\\end|[A-Za-z](\^\{[^}]*\}|_\{[^}]*\})+)/;

function hasMathFragment(text: string): boolean {
  return /\\[a-zA-Z]+/.test(text.replace(/\\\\/g, ""));
}

/** Renders KaTeX for pure formulas, or mixed prose with \\( ... \\) / \\[ ... \\]. */
export function MathText({
  children,
  display = false,
  className = "",
}: MathTextProps) {
  const text = children.trim();

  // ---- Display mode: the whole string is (or should be) one formula ----
  if (display) {
    let math = text;
    // Strip a single pair of outer display delimiters if present.
    if (/^\\\[[\s\S]*\\\]$/.test(math)) {
      math = math.slice(2, -2).trim();
    } else if (/^\$\$[\s\S]*\$\$$/.test(math)) {
      math = math.slice(2, -2).trim();
    }

    try {
      return (
        <div className={className}>
          <BlockMath
            math={math}
            renderError={() => <span>{math}</span>}
          />
        </div>
      );
    } catch {
      return <span className={className}>{math}</span>;
    }
  }

  // ---- Inline mode: plain prose, no delimiters ----
  if (
    !text.includes("\\(") &&
    !text.includes("\\[") &&
    !text.includes("$") &&
    !hasMathFragment(text)
  ) {
    return <span className={className}>{text}</span>;
  }

  // ---- Mixed prose + math ----
  const parts = text.split(
    /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g,
  );

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (!part) return null;

        let math: string | null = null;
        let block = false;

        if (part.startsWith("\\[") && part.endsWith("\\]")) {
          math = part.slice(2, -2).trim();
          block = true;
        } else if (part.startsWith("\\(") && part.endsWith("\\)")) {
          math = part.slice(2, -2).trim();
        } else if (part.startsWith("$$") && part.endsWith("$$")) {
          math = part.slice(2, -2).trim();
          block = true;
        } else if (part.startsWith("$") && part.endsWith("$")) {
          math = part.slice(1, -1).trim();
        }

        if (math !== null) {
          try {
            return block ? (
              <BlockMath key={index} math={math} renderError={() => <span>{math}</span>} />
            ) : (
              <InlineMath key={index} math={math} renderError={() => <span>{math}</span>} />
            );
          } catch {
            // Invalid LaTeX — show the raw math text rather than crashing.
            return <Fragment key={index}>{math}</Fragment>;
          }
        }

        // No delimiters: if this segment itself looks like a bare math
        // fragment (e.g. "x = \\frac{-b ...}{2a}"), render it as KaTeX.
        const trimmed = part.trim();
        if (hasMathFragment(trimmed)) {
          try {
            return (
              <InlineMath
                key={index}
                math={trimmed}
                renderError={() => <span>{part}</span>}
              />
            );
          } catch {
            return <span key={index}>{part}</span>;
          }
        }

        return <span key={index}>{part}</span>;
      })}
    </span>
  );
}
