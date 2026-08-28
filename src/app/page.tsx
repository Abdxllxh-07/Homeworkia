"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { ImageDropzone } from "@/components/ImageDropzone";
import { SiteHeader } from "@/components/SiteHeader";
import { SolutionPanel } from "@/components/SolutionPanel";
import { StepChatPanel } from "@/components/StepChatPanel";
import type { SolveResult, SolutionStep } from "@/types/solve";

export default function HomePage() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [solving, setSolving] = useState(false);
  const [result, setResult] = useState<SolveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<SolutionStep | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileAccepted(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setSelectedFile(file);
    setResult(null);
    setError(null);
  }

  function handleClear() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    setResult(null);
    setError(null);
    setSolving(false);
    setChatOpen(false);
    setActiveStep(null);
  }

  async function handleSolve() {
    if (!selectedFile || solving) return;
    setSolving(true);
    setResult(null);
    setError(null);

    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
      });
      reader.readAsDataURL(selectedFile);
      const base64Image = await base64Promise;

      const response = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64Image }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to solve problem");
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred");
    } finally {
      setSolving(false);
    }
  }

  function handleAskStep(step: SolutionStep) {
    setActiveStep(step);
    setChatOpen(true);
  }

  return (
    <>
      <SiteHeader />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-border bg-surface/80 px-5 py-6 shadow-[var(--shadow)] sm:px-10 sm:py-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-10 h-52 w-52 rounded-full bg-sky-400/10 blur-3xl"
          />

          <div className="relative mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              Open source · no paywalls
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
              Homeworkia
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
              Snap a problem, get clear steps, and ask questions.
            </p>
          </div>

          <div className="relative mx-auto mt-6 max-w-2xl space-y-4">
            <ImageDropzone
              previewUrl={previewUrl}
              onFileAccepted={handleFileAccepted}
              onClear={handleClear}
              disabled={solving}
            />

            {previewUrl && (
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1">
                  <p className="text-sm text-muted">
                    Ready to analyze?
                  </p>
                  {error && (
                    <p className="mt-1 text-sm font-medium text-red-500">
                      {error}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSolve}
                  disabled={solving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
                >
                  {solving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Solving…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Solve problem
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </section>

        {result && (
          <div className="mt-8 sm:mt-10">
            <SolutionPanel result={result} onAskStep={handleAskStep} />
          </div>
        )}

        {!previewUrl && !result && (
          <p className="mx-auto mt-10 max-w-md text-center text-sm text-muted">
            Tip: on a phone, use <span className="font-semibold text-foreground">Use camera</span>{" "}
            to shoot the worksheet directly.
          </p>
        )}
      </main>

      <footer className="border-t border-border/80 py-6 text-center text-xs text-muted">
        Homeworkia is free and open source.
      </footer>

      <StepChatPanel
        step={activeStep}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        result={result}
      />
    </>
  );
}
