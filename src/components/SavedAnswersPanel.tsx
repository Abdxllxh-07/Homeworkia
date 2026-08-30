"use client";

import { useState } from "react";
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { SavedAnswer } from "@/lib/saved-answers";
import { formatSavedDate } from "@/lib/saved-answers";

type SavedAnswersPanelProps = {
  saved: SavedAnswer[];
  onLoad: (saved: SavedAnswer) => void;
  onDelete: (id: string) => void;
  activeId: string | null;
};

/**
 * Picker for previously-saved answers. Clicking one loads that result
 * instantly (no AI call) — handy when re-testing the same question.
 * Universal: works for any subject.
 */
export function SavedAnswersPanel({
  saved,
  onLoad,
  onDelete,
  activeId,
}: SavedAnswersPanelProps) {
  const [open, setOpen] = useState(false);

  if (saved.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-2xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-soft"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-accent" />
          Saved answers ({saved.length})
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted" />
        )}
      </button>

      {open && (
        <ul className="mt-2 space-y-2">
          {saved.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5"
            >
              {item.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.preview}
                  alt=""
                  className="h-12 w-14 shrink-0 rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="flex h-12 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-muted">
                  <Bookmark className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {item.name}
                </p>
                <p className="truncate text-xs text-muted">
                  {formatSavedDate(item.savedAt)}
                  {item.provider ? ` · ${item.provider}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onLoad(item)}
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-accent-ink transition hover:border-accent/40 hover:bg-accent-soft"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Load
              </button>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-danger transition hover:border-danger/40 hover:bg-red-50"
                aria-label={`Delete saved answer ${item.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
              {activeId === item.id && (
                <span className="shrink-0 rounded-full bg-accent-soft px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-ink">
                  Active
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}