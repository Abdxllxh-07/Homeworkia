import { Code2, Heart } from "lucide-react";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border/80 bg-surface/70 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="font-[family-name:var(--font-display)] text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
            Homeworkia
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-1.5 rounded-xl bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink sm:inline-flex">
            <Heart className="h-3.5 w-3.5" />
            Free forever
          </span>
          <a
            href="https://github.com/Abdxllxh-07/homeworkia"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-soft"
          >
            <Code2 className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </div>
    </header>
  );
}
