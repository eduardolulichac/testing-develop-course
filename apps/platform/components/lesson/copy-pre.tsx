"use client";

import { useRef, useState, type ComponentPropsWithoutRef } from "react";

/** Code block with a "Copiar" button. Without JavaScript it still renders as a plain block. */
export function CopyPre({
  copyLabel,
  ...props
}: ComponentPropsWithoutRef<"pre"> & {
  /** Accessible name for the button when a page has more than one block, e.g. "Copiar secreto". */
  copyLabel?: string;
}) {
  const ref = useRef<HTMLPreElement>(null);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(ref.current?.textContent ?? "");
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <div className="group relative my-4">
      <pre
        ref={ref}
        // Scrollable regions must be focusable so keyboard users can read long lines.
        tabIndex={0}
        className="overflow-x-auto rounded-md border border-border bg-background p-4 pr-20 font-mono text-sm leading-6 [&_code]:bg-transparent [&_code]:p-0"
        {...props}
      />
      <button
        type="button"
        onClick={copy}
        aria-label={copyLabel}
        className="absolute top-2 right-2 rounded border border-border bg-surface px-2 py-1 text-xs"
      >
        {state === "copied" ? "Copiado" : state === "failed" ? "No se pudo copiar" : "Copiar"}
        <span className="sr-only" role="status">
          {state === "copied" ? "Código copiado al portapapeles" : ""}
        </span>
      </button>
    </div>
  );
}
