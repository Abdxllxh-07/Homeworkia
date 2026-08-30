"use client";

import { MessageCircleQuestion } from "lucide-react";
import type { SolutionStep } from "@/types/solve";
import { MathText } from "@/components/MathText";

type StepCardProps = {
  step: SolutionStep;
  displayNumber: number;
  onAsk: (step: SolutionStep) => void;
};

export function StepCard({ step, displayNumber, onAsk }: StepCardProps) {
  // LLMs sometimes emit a step with an EMPTY mathFormula (a purely descriptive
  // step, or a model glitch). Rendering "" through KaTeX yields an invisible,
  // empty-looking box while the final answer box still shows text — which looks
  // like "the answer box didn't show the answer but the final answer did".
  // Universal guard: whenever the formula is missing/blank, fall back to the
  // step's explanation in the math box so a step NEVER renders as an empty box.
  const hasFormula =
    typeof step.mathFormula === "string" && step.mathFormula.trim().length > 0;
  const boxContent = hasFormula ? (
    <MathText display className="text-accent-ink text-lg">
      {step.mathFormula}
    </MathText>
  ) : (
    <MathText className="text-accent-ink text-base leading-relaxed">
      {step.explanation || "No formula provided for this step."}
    </MathText>
  );

  return (
    <article className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-sm font-bold text-accent-ink">
            {displayNumber}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="text-base font-semibold text-foreground sm:text-lg">
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted sm:text-[15px] min-w-0">
              <MathText>{step.explanation}</MathText>
            </p>
            <div className="w-full h-auto min-h-[3.5rem] p-4 rounded-xl bg-surface-soft border border-border/50 flex flex-col justify-center overflow-x-auto min-w-0">
              {boxContent}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end border-t border-border/70 pt-3">
        <button
          type="button"
          onClick={() => onAsk(step)}
          style={{ touchAction: "manipulation" }}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:border-accent/40 hover:bg-accent-soft active:scale-[0.98]"
        >
          <MessageCircleQuestion className="h-4 w-4" />
          Ask about this step
        </button>
      </div>
    </article>
  );
}
