"use client";

import type { SolveResult } from "@/types/solve";
import { sanitizeResult } from "@/lib/sanitize";

/**
 * Saved-answers store — persists solved results so re-testing a question
 * loads the cached answer instantly instead of calling an AI provider again.
 *
 * Universal: works for ANY question (math, chem, physics, medical, ...).
 * Stored in browser localStorage (private, no server needed).
 */

export type SavedAnswer = {
  id: string;
  name: string; // e.g. "test-question2.jpeg"
  savedAt: number; // epoch ms
  preview: string | null; // data URL thumbnail (small) or null
  result: SolveResult;
  provider: string; // model/fallback that produced it (informational)
};

const STORAGE_KEY = "homeworkia.savedAnswers.v1";
const MAX_SAVED = 50;

// Module-level cache so useSyncExternalStore gets a STABLE reference between
// storage events (returning a fresh array every call would re-render forever).
// The EMPTY_LIST singleton matters: when storage is empty, getSnapshot must
// still return the SAME reference each render or React warns "getSnapshot
// should be cached to avoid an infinite loop" (and can hit max-update-depth
// on fresh browsers — e.g. a phone with no saved answers yet).
const EMPTY_LIST: SavedAnswer[] = [];
let cached: SavedAnswer[] | null = null;

// In-tab subscribers. Persisting a change (save/delete/clear) MUST notify them
// or the useSyncExternalStore UI never re-renders (the deleted item stays
// visible; only "Clear all" appeared to work because setActiveSavedId(null)
// coincidentally re-rendered the page). The storage event only fires for OTHER
// tabs, so local mutations need their own notification path.
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const l of listeners) l();
}

/** Listen to storage events so multiple tabs stay in sync. */
export function subscribeSavedAnswers(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.add(onChange);
  const onStorage = () => {
    cached = null;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Read all saved answers from localStorage (safe, never throws). */
export function loadSavedAnswers(): SavedAnswer[] {
  if (cached) return cached;
  if (typeof window === "undefined") return EMPTY_LIST;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Cache the empty list too. Returning a fresh [] every call changes the
      // snapshot identity on every render -> React flags it as an infinite-loop
      // risk. Same singleton also keeps SSR/client snapshots consistent.
      cached = EMPTY_LIST;
      return cached;
    }
    const parsed = JSON.parse(raw) as SavedAnswer[];
    // Sanitize any leaked chain-of-thought + final-answer inconsistencies so old
    // saved answers display cleanly and consistently (universal for all subjects).
    if (Array.isArray(parsed)) {
      for (const entry of parsed) entry.result = sanitizeResult(entry.result);
    }
    cached = Array.isArray(parsed) ? parsed : EMPTY_LIST;
    return cached;
  } catch (e) {
    console.warn("Could not read saved answers:", e);
    cached = EMPTY_LIST;
    return cached;
  }
}

/** Read the latest snapshot for useSyncExternalStore. */
export function getSavedAnswersSnapshot(): SavedAnswer[] {
  return loadSavedAnswers();
}

/** Persist a list of saved answers (safe, capped). */
function persistAnswers(list: SavedAnswer[]) {
  cached = list;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("Could not save answers:", e);
  }
  // Let the UI (useSyncExternalStore) re-render immediately — without this the
  // list updates in storage but the panel keeps showing stale items.
  notifyListeners();
}

/**
 * Save a solve result. De-duplicates identical results (same content) so we
 * don't fill storage with duplicates. Returns the final list.
 */
export function saveAnswer(input: {
  name: string;
  result: SolveResult;
  preview: string | null;
  provider: string;
}): { list: SavedAnswer[]; id: string } {
  const list = loadSavedAnswers();

  // De-dupe: skip if an identical result (same steps/finalAnswer) exists.
  const contentKey = JSON.stringify(input.result);
  const existing = list.some((s) => JSON.stringify(s.result) === contentKey);
  if (existing) {
    return { list, id: list.find((s) => JSON.stringify(s.result) === contentKey)?.id || "" };
  }

  const id = `answer-${Date.now()}`;
  const item: SavedAnswer = {
    id,
    name: input.name || "Unsaved question",
    savedAt: Date.now(),
    preview: input.preview,
    result: input.result,
    provider: input.provider,
  };

  const next = [item, ...list].slice(0, MAX_SAVED);
  persistAnswers(next);
  return { list: next, id };
}

/** Delete one saved answer by id. */
export function deleteSavedAnswer(id: string): SavedAnswer[] {
  const list = loadSavedAnswers().filter((s) => s.id !== id);
  persistAnswers(list);
  return list;
}

/** Clear ALL saved answers. */
export function clearSavedAnswers(): SavedAnswer[] {
  persistAnswers([]);
  return [];
}

/** Short human date helper. */
export function formatSavedDate(epochMs: number): string {
  try {
    return new Date(epochMs).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}