import { useEffect, useState } from "react";
import { useScenario, useScenarioContext } from "./ScenarioProvider";

/** Web-layer defects the API reveals through `uiFlags` (ids from the defect catalog). */
export type UiFlag =
  | "ui.typo_messages"
  | "ui.testid_rotating"
  | "ui.ambiguous_labels"
  | "ui.late_loading"
  | "ui.double_submit"
  | "ui.state_mismatch"
  | "ui.a11y_violations"
  | "ui.visual_regression";

export function useUiFlag(flag: UiFlag): boolean {
  const { state } = useScenario();
  return (state?.uiFlags ?? []).includes(flag);
}

/** Small stable hash (FNV-1a) so suffixes and delays are reproducible per seed and release. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * `ui.testid_rotating`: with the flag, `data-testid` gets a suffix derived from the seed and the
 * release, so a locator copied from another release or seed stops matching.
 */
export function useTestId(): (base: string) => string | undefined {
  const { state, loaded } = useScenarioContext();
  const on = (state?.uiFlags ?? []).includes("ui.testid_rotating");
  // Until the scenario is known the element is painted without `data-testid`: otherwise the
  // unsuffixed id would exist for a moment and a brittle locator would pass by winning a race.
  if (!loaded) return () => undefined;
  if (!on) return (base) => base;
  const suffix = hash(`${state?.seedVersion}|${state?.release ?? ""}`)
    .toString(36)
    .slice(0, 5);
  return (base) => `${base}-${suffix}`;
}

/** `ui.typo_messages`: error messages with misspelled words (deterministic letter swaps). */
export function misspell(message: string): string {
  return message.replace(/[A-Za-zÁÉÍÓÚáéíóúñ]{5,}/g, (w) => w[0]! + w[2]! + w[1]! + w.slice(3));
}
export function useMessages(): (message: string) => string {
  const on = useUiFlag("ui.typo_messages");
  return on ? misspell : (m) => m;
}

/** `ui.late_loading`: how long the content waits behind a skeleton (1.5–3 s by default). */
export const LATE_LOADING_MS = { min: 1500, max: 3000 };

export function useLateReady(key: string): boolean {
  const { state } = useScenario();
  const on = useUiFlag("ui.late_loading");
  const [ready, setReady] = useState(!on);
  useEffect(() => {
    if (!on) {
      setReady(true);
      return;
    }
    setReady(false);
    const span = LATE_LOADING_MS.max - LATE_LOADING_MS.min;
    const ms = LATE_LOADING_MS.min + (hash(`${state?.seedVersion}|${key}`) % (span + 1));
    const t = setTimeout(() => setReady(true), ms);
    return () => clearTimeout(t);
  }, [on, key, state?.seedVersion]);
  return ready;
}

/** `ui.visual_regression`: the `arena-v2` class on <body> restyles price and buttons. */
export function useVisualRegression(): void {
  const on = useUiFlag("ui.visual_regression");
  useEffect(() => {
    document.body.classList.toggle("arena-v2", on);
    return () => document.body.classList.remove("arena-v2");
  }, [on]);
}
