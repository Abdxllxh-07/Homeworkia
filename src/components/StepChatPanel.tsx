"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import type { ChatMessage, SolutionStep, SolveResult } from "@/types/solve";
import { MathText } from "@/components/MathText";

type StepChatPanelProps = {
  step: SolutionStep | null;
  open: boolean;
  onClose: () => void;
  result: SolveResult | null;
};

export function StepChatPanel({ step, open, onClose, result }: StepChatPanelProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !step) return;
    setMessages([
      {
        id: "intro",
        role: "assistant",
        content: `Ask anything about step ${step.stepNumber}: "${step.title}". I'm ready to help!`,
      },
    ]);
    setDraft("");
    const timer = window.setTimeout(() => inputRef.current?.focus(), 150);
    return () => window.clearTimeout(timer);
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Early return ensures result is non-null for the rest of the component
  if (!open || !step || !result) return null;

  const currentResult = result;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setSending(true);

    try {
      const response = await fetch("/api/ask-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step,
          userQuestion: text,
          problemText: currentResult.problemText,
          finalAnswer: currentResult.finalAnswer,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to get answer");
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.answer,
        },
      ]);
    } catch (err: any) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: "Sorry, I couldn't get an answer right now. Please try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close panel backdrop"
        className="absolute inset-0 bg-foreground/35 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-[var(--shadow)] motion-safe:animate-[panel-in_220ms_ease-out]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              Step Q&amp;A
            </p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold text-foreground">
              Step {step.stepNumber}: {step.title}
            </h2>
            <div className="mt-2 text-sm text-muted">
              <MathText>{step.mathFormula}</MathText>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border p-2 text-muted transition hover:bg-surface-soft hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={[
                "max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                msg.role === "user"
                  ? "ml-auto bg-accent text-white"
                  : "mr-auto bg-surface-soft text-foreground border border-border/50",
              ].join(" ")}
            >
              {msg.role === "assistant" ? (
                <MathText>{msg.content}</MathText>
              ) : (
                msg.content
              )}
            </div>
          ))}
          {sending && (
            <div className="mr-auto rounded-2xl bg-surface-soft px-4 py-3 text-sm text-muted border border-border/50">
              Thinking…
            </div>
          )}
        </div>

        <form
          onSubmit={handleSend}
          className="border-t border-border p-3 sm:p-4"
        >
          <div className="flex items-center gap-2 rounded-2xl border-2 border-border bg-surface-soft px-3 py-2.5">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Why did we do this?"
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted text-foreground"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-white transition hover:bg-accent-ink disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="h-4.5 w-4.5" />
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
