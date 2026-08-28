"use client";

import { MessageCircleQuestion } from "lucide-react";
import type { SolutionStep } from "@/types/solve";
import { MathText } from "@/components/MathText";

type StepCardProps = {
  step: SolutionStep;
  onAsk: (step: SolutionStep) => void;
};

export function StepCard({ step, onAsk }: StepCardProps) {
  return (
    <article className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-sm font-bold text-accent-ink">
            {step.stepNumber}
          </span>
          <div className="min-w-0 space-y-2">
            <h3 className="text-base font-semibold text-foreground sm:text-lg">
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted sm:text-[15px]">
              <MathText>{step.explanation}</MathText>
            </p>
            <div className="overflow-x-auto rounded-xl bg-surface-soft px-4 py-3 border border-border/50">
              <MathText display className="text-accent-ink text-lg">{step.mathFormula}</MathText>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end border-t border-border/70 pt-3">
        <button
          type="button"
          onClick={() => onAsk(step)}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-accent-ink transition hover:border-accent/40 hover:bg-accent-soft"
        >
          <MessageCircleQuestion className="h-4 w-4" />
          Ask about this step
        </button>
      </div>
    </article>
  );
}
