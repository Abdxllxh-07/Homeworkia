"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import { useDropzone } from "react-dropzone";
import { Camera, ImagePlus, Upload, X } from "lucide-react";

type ImageDropzoneProps = {
  previewUrl: string | null;
  onFileAccepted: (file: File) => void;
  onClear: () => void;
  disabled?: boolean;
};

export function ImageDropzone({
  previewUrl,
  onFileAccepted,
  onClear,
  disabled = false,
}: ImageDropzoneProps) {
  // Deterministic id (React's useId) — stable between server & client so the
  // label htmlFor === input id match after hydration.
  const pickerId = useId();
  const cameraId = `${pickerId}-camera`;

  // "Use camera" only works on phones/tablets (it opens the device camera via
  // capture="environment"). On a desktop the input would just open a boring
  // file picker — so we show a polite popup instead and keep the real camera
  // input closed.
  const [cameraWarning, setCameraWarning] = useState(false);
  const isTouchDevice =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse) and (hover: none)").matches;

  // Auto-dismiss the warning after a few seconds so it never lingers.
  useEffect(() => {
    if (!cameraWarning) return;
    const t = window.setTimeout(() => setCameraWarning(false), 4500);
    return () => window.clearTimeout(t);
  }, [cameraWarning]);

  // React's synthetic onChange (root-delegated) is FLAKY for <input type="file">
  // on real mobile devices — the picker opens, the file is selected, but the
  // change event is sometimes never processed (timing / iOS Safari quirks).
  // Bulletproof fix: attach NATIVE change listeners directly to the inputs via
  // refs, completely bypassing React's event delegation. This is the universal
  // fix that works on every browser/device.
  const pickerRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0];
      if (file) onFileAccepted(file);
    },
    [onFileAccepted],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".heic"] },
    multiple: false,
    disabled,
    noClick: true, // Never rely on synthetic clicks for the root — mobile-safe.
    noKeyboard: true,
  });

  const handleDrop = useCallback(
    (input: HTMLInputElement) => {
      const file = input.files?.[0];
      if (file) onFileAccepted(file);
      // Allow selecting the same file again next time.
      input.value = "";
    },
    [onFileAccepted],
  );

  // Extract the first image from a ClipboardEvent (Ctrl/Cmd+V anywhere on the
  // dropzone) so desktop users can paste a screenshot directly.
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            onFileAccepted(file);
            return;
          }
        }
      }
    },
    [onFileAccepted],
  );

  // Native listeners bypass React's synthetic event system entirely.
  // Guarantees the selected file is picked up even where React's delegated
  // "input" event listener is unreliable (iOS Safari + file inputs).
  useEffect(() => {
    const picker = pickerRef.current;
    const camera = cameraRef.current;
    const onPickerChange = () => picker && handleDrop(picker);
    const onCameraChange = () => camera && handleDrop(camera);
    picker?.addEventListener("change", onPickerChange);
    camera?.addEventListener("change", onCameraChange);
    return () => {
      picker?.removeEventListener("change", onPickerChange);
      camera?.removeEventListener("change", onCameraChange);
    };
  }, [handleDrop]);

  const handleCameraClick = useCallback(
    (e: React.MouseEvent<HTMLLabelElement>) => {
      if (disabled) return;
      if (isTouchDevice) return; // mobile: let the native input open the camera
      // Desktop: don't open the hidden file input — show the notice instead.
      e.preventDefault();
      setCameraWarning(true);
    },
    [disabled, isTouchDevice],
  );

  return (
    <section
      className="w-full"
      onPaste={handlePaste}
      title="Tip: press Ctrl/Cmd+V to paste a screenshot"
    >
      {!previewUrl ? (
        <div>
          <div
            {...getRootProps()}
            className={[
              "group relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
              isDragActive
                ? "border-accent bg-accent-soft/60"
                : "border-border bg-surface hover:border-accent/60 hover:bg-surface-soft/70",
              disabled ? "pointer-events-none opacity-60" : "",
            ].join(" ")}
            style={{ touchAction: "manipulation" }}
          >
            <input {...getInputProps()} />
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Upload className="h-6 w-6" strokeWidth={2} />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold text-foreground">
                {isDragActive ? "Drop it here" : "Drop or paste your photo here"}
              </p>
              <p className="text-sm text-muted">
                PNG, JPG, or WEBP — or take a photo on mobile
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {/* Native <label> + hidden input — the gold standard for mobile file
                uploads. No synthetic .click() needed, works on iOS/Android. */}
            <label
              htmlFor={pickerId}
              aria-disabled={disabled}
              style={{ touchAction: "manipulation" }}
              className={
                "inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-ink hover:shadow-md active:scale-[0.98] " +
                (disabled ? "pointer-events-none opacity-60" : "")
              }
            >
              <ImagePlus className="h-4 w-4" />
              Choose image
            </label>
            <label
              htmlFor={cameraId}
              aria-disabled={disabled}
              onClick={handleCameraClick}
              style={{ touchAction: "manipulation" }}
              className={
                "inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border-2 border-border bg-surface px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-soft hover:border-accent/40 active:scale-[0.98] " +
                (disabled ? "pointer-events-none opacity-60" : "")
              }
            >
              <Camera className="h-4 w-4" />
              Use camera
            </label>
          </div>

          {cameraWarning && (
            <div
              role="status"
              className="mx-auto mt-3 flex max-w-md items-start gap-2 rounded-xl border border-accent/30 bg-accent-soft/70 px-4 py-3 text-sm text-accent-ink"
            >
              <Camera className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="font-semibold">Use camera</span> only works on
                mobile devices. On a PC, use{" "}
                <span className="font-semibold">Choose image</span> or press{" "}
                <span className="font-semibold">Ctrl/Cmd+V</span> to paste a
                screenshot.
              </span>
              <button
                type="button"
                onClick={() => setCameraWarning(false)}
                className="ml-auto shrink-0 rounded-lg p-1 text-accent-ink/70 transition hover:bg-accent-soft hover:text-accent-ink"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Uploaded homework preview"
            className="max-h-[420px] w-full object-contain bg-surface-soft"
          />
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-xl bg-foreground/90 px-3 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-foreground disabled:opacity-50"
            aria-label="Remove image"
          >
            <X className="h-4 w-4" />
            Remove
          </button>
        </div>
      )}

      {/* Standards-compliant approach: inputs are visually hidden but present in
          the DOM. Some mobile browsers (esp. iOS Safari) ignore .click() on
          display:none inputs, so we use sr-only-style hiding instead. The
          change handler is attached NATIVELY (via ref) not via React's synthetic
          onChange — see the useEffect above. */}
      <input
        id={pickerId}
        ref={pickerRef}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={disabled}
      />
      <input
        id={cameraId}
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={disabled}
      />
    </section>
  );
}
