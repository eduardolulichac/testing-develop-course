import type { Fault } from "./schema.ts";
import { rngFor } from "./rng.ts";

export type Effect =
  | { type: "none" }
  | { type: "delay"; ms: number }
  | { type: "error"; status: number; code: string }
  | { type: "timeout"; ms: number };

/**
 * Decides what a fault does on call number `n` (0-based) at `point`.
 *
 * "One in N" means exactly one hit per window of N calls: window `w = floor(n / N)`, and the
 * hit position inside it is `floor(rng(seed, point, w) * N)`. The position looks random but is
 * fixed for a given seed, so the flaky behaviour is reproducible.
 */
export function decideFault(fault: Fault, seed: number, point: string, n: number): Effect {
  const oneIn = fault.oneIn;
  const window = Math.floor(n / oneIn);
  const hitPosition = Math.floor(rngFor(seed, point, window)() * oneIn);
  if (n % oneIn !== hitPosition) return { type: "none" };

  switch (fault.type) {
    case "error":
      return { type: "error", status: fault.status, code: fault.code };
    case "timeout":
      return { type: "timeout", ms: fault.afterMs };
    case "latency": {
      const span = Math.max(0, fault.maxMs - fault.minMs);
      const ms = fault.minMs + Math.floor(rngFor(seed, point, "lat", n)() * (span + 1));
      return { type: "delay", ms };
    }
  }
}
