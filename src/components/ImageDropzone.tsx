"use client";

import { useCallback, useRef } from "react";
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
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0];
      if (file) onFileAccepted(file);
    },
    [onFileAccepted],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".heic"] },
    multiple: false,
    disabled,
    noClick: Boolean(previewUrl),
    noKeyboard: Boolean(previewUrl),
  });

  return (
    <section className="w-full">
      {!previewUrl ? (
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
              {isDragActive ? "Drop it here" : "Drop a homework photo"}
            </p>
            <p className="text-sm text-muted">
              PNG, JPG, or WEBP — or take a photo on mobile
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                open();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ touchAction: "manipulation" }}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-ink hover:shadow-md"
            >
              <ImagePlus className="h-4 w-4" />
              Choose image
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cameraInputRef.current?.click();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ touchAction: "manipulation" }}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-border bg-surface px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-soft hover:border-accent/40"
            >
              <Camera className="h-4 w-4" />
              Use camera
            </button>
          </div>
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

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onFileAccepted(file);
          }
          // Reset value so same file can be captured again if removed
          e.target.value = "";
        }}
      />
    </section>
  );
}
