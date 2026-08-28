"use client";

import type { SolveResult, SolutionStep } from "@/types/solve";
import { MathText } from "@/components/MathText";
import { StepCard } from "@/components/StepCard";

type SolutionPanelProps = {
  result: SolveResult;
  onAskStep: (step: SolutionStep) => void;
};

export function SolutionPanel({ result, onAskStep }: SolutionPanelProps) {
  return (
    <section className="space-y-5" aria-live="polite">
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow)] sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent mb-3">
          Problem
        </p>
        <div className="text-base text-foreground sm:text-lg leading-relaxed">
          <MathText className="text-inherit">{result.problemText}</MathText>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3 px-1">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Step by step
          </h2>
          <p className="text-xs text-muted sm:text-sm">
            Tap ask on any step
          </p>
        </div>
        <div className="space-y-3">
          {result.steps.map((step) => (
            <StepCard key={step.stepNumber} step={step} onAsk={onAskStep} />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-accent/25 bg-accent-soft/50 p-4 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-ink mb-3">
          Final answer
        </p>
        <div className="space-y-2">
          {result.finalAnswer.split('\n').filter(Boolean).map((part, i) => (
            <div key={i} className="whitespace-pre-wrap text-center">
              <MathText display className="text-accent-ink text-xl font-medium">{part.trim()}</MathText>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
