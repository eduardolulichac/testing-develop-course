"use client";

import { useEffect, useSyncExternalStore } from "react";
import { trackClient } from "@/components/analytics/client";
import type { DonationOption } from "@/lib/donations/config";

const STORAGE_KEY = "donation-qr-dismissed";
const CHANGE_EVENT = "donation-qr-change";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Storage can be blocked (private windows, site data off): then the choice only lasts for the page.
let dismissedInMemory = false;

function readDismissed(): boolean {
  try {
    return dismissedInMemory || localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return dismissedInMemory;
  }
}

function dismiss() {
  dismissedInMemory = true;
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Ignored on purpose: the in-memory flag already hides it for this visit.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Voluntary-contribution QR codes (paid directly to the author). Friendly, dismissible, no pressure. */
export function DonationQr({
  options,
  ubicacion,
}: {
  options: DonationOption[];
  ubicacion: string;
}) {
  // Hidden on the server and on first paint so a dismissed card never flashes.
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  const visible = options.length > 0 && !dismissed;
  useEffect(() => {
    if (visible) trackClient("donation_qr_viewed", { ubicacion });
  }, [visible, ubicacion]);
  if (!visible) return null;

  return (
    <aside
      aria-label="Aportes voluntarios"
      data-testid="donation-qr"
      data-ubicacion={ubicacion}
      className="mt-10 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium">¿Te está sirviendo el curso?</h2>
          <p className="mt-1 text-sm text-muted">
            El curso es gratuito y seguirá siéndolo. Si quieres apoyar al autor, puedes hacer un
            aporte voluntario; si no, no pasa nada.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            trackClient("donation_qr_dismissed", { ubicacion });
            dismiss();
          }}
          className="shrink-0 rounded-md border border-border px-3 py-1 text-sm"
        >
          Ocultar
        </button>
      </div>
      <ul className="mt-4 flex flex-wrap gap-4">
        {options.map((o) => (
          <li key={o.id} className="text-center text-sm">
            {/* The source is configurable (path or https URL), so next/image's host allowlist does not fit. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={o.src}
              alt={`Código QR para aportar con ${o.label}`}
              width={140}
              height={140}
              className="rounded-md border border-border bg-white"
            />
            <span className="mt-1 block text-muted">{o.label}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
