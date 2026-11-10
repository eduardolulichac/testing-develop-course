import { createEngine, type Effect, type Engine, type Scenario } from "@course/scenario-engine";
import type { Deps } from "./context.js";
import type { SessionInfo } from "./db/sessions.js";

export const NO_EFFECT: Effect = { type: "none" };

/** Only the ephemeral, single-student Arena may run `runnerOnly` defects (review H7). */
export const allowsRunnerOnly = (deps: Pick<Deps, "config">) =>
  deps.config.ARENA_DEPLOYMENT === "ephemeral";

/** A session's scenario; one that no longer exists after a deploy falls back to the baseline. */
export function scenarioOf(deps: Pick<Deps, "registry">, id: string): Scenario {
  return deps.registry.scenarios.get(id) ?? deps.registry.scenarios.get("baseline")!;
}

/**
 * The engine for a session. Engines are immutable, so one per (scenario, release, rng seed) is
 * cached and shared by every session that uses that combination.
 */
export function engineFor(session: SessionInfo, deps: Deps): Engine {
  const scenario = scenarioOf(deps, session.scenario);
  const key = `${scenario.id}|${session.release ?? ""}|${session.rngSeed ?? ""}`;
  let engine = deps.engines.get(key);
  if (!engine) {
    try {
      engine = createEngine({
        scenario,
        registry: deps.registry,
        release: session.release ?? undefined,
        rngSeed: session.rngSeed ?? undefined,
        allowRunnerOnly: allowsRunnerOnly(deps),
      });
    } catch (err) {
      // A deploy can leave a session pointing at a release that no longer exists, or at a
      // scenario this instance may not run. Serve the baseline instead of failing every request
      // (review H19); the learner picks a scenario again from the selector.
      if (scenario.id === "baseline") throw err;
      engine = createEngine({
        scenario: scenarioOf(deps, "baseline"),
        registry: deps.registry,
        allowRunnerOnly: allowsRunnerOnly(deps),
      });
    }
    deps.engines.set(key, engine);
  }
  return engine;
}
