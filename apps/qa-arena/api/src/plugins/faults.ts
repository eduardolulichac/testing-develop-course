import type { FastifyInstance } from "fastify";
import { ensureOptions, peekSessionId, RELEASE_HEADER, type Deps } from "../context.js";
import { ensureSession, findSession, nextFaultIndex } from "../db/sessions.js";
import { engineFor, scenarioOf } from "../engine.js";
import { HttpError } from "../errors.js";

declare module "fastify" {
  interface FastifyContextConfig {
    /** Marks a route as a fault injection point, e.g. `catalog.list`. */
    injectionPoint?: string;
  }
}

/**
 * Injects latency and 5xx at routes declared with `config: { injectionPoint }`. It runs before
 * the handler's transaction (see `nextFaultIndex`). Without active faults at the point it costs
 * one session lookup.
 */
export function faultsPlugin(app: FastifyInstance, deps: Deps) {
  app.addHook("preHandler", async (req, reply) => {
    const point = req.routeOptions.config.injectionPoint;
    if (!point) return;
    const id = peekSessionId(req, deps.config);
    if (id === null) return;
    let session = await findSession(deps.db, id);
    if (!session) {
      // `run()` is about to create this session with the default scenario. When that scenario
      // has faults here, create it now so the very first call is counted and injected too
      // (review H21); otherwise there is nothing to inject and no reason to create it early.
      const born = scenarioOf(deps, deps.config.ARENA_DEFAULT_SCENARIO ?? "baseline");
      const probe = engineFor(
        { id, schema: "", scenario: born.id, release: null, rngSeed: null, settings: {} },
        deps,
      );
      if (probe.faultsAt(point).length === 0) return;
      session = await ensureSession(deps.db, id, ensureOptions(deps, req));
    }

    const engine = engineFor(session, deps);
    const faults = engine.faultsAt(point);
    if (faults.length === 0) return;
    if (!deps.config.ARENA_RUNNER_MODE) reply.header(RELEASE_HEADER, engine.release ?? "none");

    const effect = engine.decide(point, await nextFaultIndex(deps.db, id, point));
    switch (effect.type) {
      case "none":
        return;
      case "delay":
        await deps.sleep(effect.ms);
        return;
      case "timeout":
        await deps.sleep(effect.ms);
        throw new HttpError(504, "gateway_timeout", "The upstream service timed out");
      case "error": {
        // A defect can ask to be visible in the response headers (module 0.4 practices reading them).
        if (
          !deps.config.ARENA_RUNNER_MODE &&
          faults.some((f) => engine.param<boolean>(f.defectId, "exposeFault"))
        ) {
          reply.header("X-Arena-Fault", effect.code);
        }
        throw new HttpError(effect.status, effect.code, `Service error (${effect.code})`);
      }
    }
  });
}
