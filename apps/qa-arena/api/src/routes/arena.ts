import { createHash } from "node:crypto";
import type { Engine, Scenario } from "@course/scenario-engine";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  DEFAULT_ASSISTANT,
  FAULTS,
  loadCatalog,
  stubAssistant,
  type AssistantSettings,
} from "../assistant/stub.js";
import { llmAssistant } from "../assistant/llm.js";
import {
  ensureOptions,
  isEvaluator,
  RELEASE_HEADER,
  resolveSessionId,
  run,
  type Deps,
} from "../context.js";
import {
  effectiveRngSeed,
  ensureSession,
  resetSession,
  setScenario,
  updateSettings,
  type SessionInfo,
} from "../db/sessions.js";
import { seedVersionOf } from "../db/seed.js";
import { allowsRunnerOnly, engineFor, scenarioOf } from "../engine.js";
import { badRequest, HttpError, notFound } from "../errors.js";
import { ErrorSchema, errors } from "../schemas.js";

const AssistantSchema = z.object({
  mode: z.enum(["normal", "faulty"]),
  faults: z.array(z.enum(FAULTS)),
});

const StateSchema = z.object({
  session: z.string().nullable(),
  scenario: z.string(),
  release: z.string().nullable(),
  releases: z.array(z.object({ id: z.string(), label: z.string() })),
  seedVersion: z.string(),
  sessionMode: z.enum(["shared", "per-visitor"]),
  environment: z.object({
    label: z.enum(["local", "qa", "staging"]),
    banner: z.string().optional(),
    clock: z.string().optional(),
  }),
  // Backend defects are deliberately not listed (no spoilers in DevTools); the web layer needs its own.
  uiFlags: z.array(z.string()),
  hasRequirements: z.boolean(),
  /** Runner Arena (evaluator, templates): the web hides every scenario control. */
  runnerMode: z.boolean(),
  assistant: AssistantSchema,
});

function assistantOf(settings: Record<string, unknown>): AssistantSettings {
  return { ...DEFAULT_ASSISTANT, ...((settings.assistant as Partial<AssistantSettings>) ?? {}) };
}

function isEvaluatorReq(deps: Deps, req: FastifyRequest): boolean {
  return isEvaluator(deps.config, req);
}

/** Full view of the Arena: always outside runner mode; in runner mode only for the evaluator. */
function seesEverything(deps: Deps, req: FastifyRequest): boolean {
  return !deps.config.ARENA_RUNNER_MODE || isEvaluatorReq(deps, req);
}

/** Switching scenarios/settings: as `seesEverything`, but template Arenas (no token) stay open. */
function mayOperate(deps: Deps, req: FastifyRequest): boolean {
  return seesEverything(deps, req) || !deps.config.ARENA_RUNNER_TOKEN;
}

function mustOperate(deps: Deps, req: FastifyRequest): void {
  if (!mayOperate(deps, req))
    throw new HttpError(403, "runner_token_required", "Not available on this Arena");
}

/**
 * Runner Arena, caller without the token (the student's code, the web): only what the browser
 * needs to paint. No scenario, release, environment, requirements or seed: `seedVersion` is an
 * opaque salt that exists only while a `ui.*` flag is on (its flag list already shows that).
 */
function minimalStateOf(
  deps: Deps,
  engine: Engine,
  full: z.infer<typeof StateSchema>,
): z.infer<typeof StateSchema> {
  const flags = engine.uiFlags();
  return {
    session: null,
    scenario: "runner",
    release: null,
    releases: [],
    seedVersion: flags.length
      ? createHash("sha256")
          .update(`${full.seedVersion}|${engine.release ?? ""}`)
          .digest("hex")
          .slice(0, 12)
      : "none",
    sessionMode: deps.config.ARENA_SESSION_MODE,
    environment: { label: "local" },
    uiFlags: flags,
    hasRequirements: false,
    runnerMode: true,
    assistant: { ...DEFAULT_ASSISTANT },
  };
}

function stateOf(
  deps: Deps,
  session: SessionInfo,
  engine: Engine,
  req: FastifyRequest,
): z.infer<typeof StateSchema> {
  const full = fullStateOf(deps, session, engine);
  return seesEverything(deps, req) ? full : minimalStateOf(deps, engine, full);
}

function fullStateOf(
  deps: Deps,
  session: SessionInfo,
  engine: Engine,
): z.infer<typeof StateSchema> {
  // The engine decides the effective scenario: it falls back to the baseline when the stored one
  // can no longer run (review H19).
  const scenario = scenarioOf(deps, engine.scenarioId);
  return {
    session: session.id || null,
    scenario: scenario.id,
    release: engine.release,
    releases: scenario.releases.map(({ id, label }) => ({ id, label })),
    seedVersion: seedVersionOf(scenario.seed.variant, effectiveRngSeed(scenario, session.rngSeed)),
    sessionMode: deps.config.ARENA_SESSION_MODE,
    environment: scenario.environment,
    uiFlags: engine.uiFlags(),
    hasRequirements: engine.requirements() !== null,
    runnerMode: deps.config.ARENA_RUNNER_MODE,
    assistant: assistantOf(session.settings),
  };
}

/** A scenario this instance may activate, or the error explaining why not. */
function activatable(deps: Deps, id: string): Scenario {
  const scenario = deps.registry.scenarios.get(id);
  if (!scenario) throw notFound("Unknown scenario");
  if (!scenario.hosted && !allowsRunnerOnly(deps)) {
    throw new HttpError(403, "runner_only", "This scenario only runs on the ephemeral Arena");
  }
  return scenario;
}

export function arenaRoutes(app: FastifyInstance, deps: Deps) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/healthz", { schema: { hide: true } }, async () => ({ ok: true }));

  r.get(
    "/__arena/scenarios",
    {
      schema: {
        tags: ["arena"],
        summary: "Scenarios this instance can activate",
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              module: z.string(),
              publicSummary: z.string(),
              releases: z.array(z.object({ id: z.string(), label: z.string() })),
              hosted: z.boolean(),
            }),
          ),
        },
      },
    },
    async (req) => {
      // Runner Arena: the list of scenarios (eval-* included) is for the evaluator only.
      if (!seesEverything(deps, req)) return [];
      return [...deps.registry.scenarios.values()]
        .filter((s) => s.hosted || allowsRunnerOnly(deps))
        .map((s) => ({
          id: s.id,
          title: s.title,
          module: s.module,
          publicSummary: s.publicSummary,
          releases: s.releases.map(({ id, label }) => ({ id, label })),
          hosted: s.hosted,
        }));
    },
  );

  r.get(
    "/__arena/state",
    {
      schema: {
        tags: ["arena"],
        summary:
          "State of the caller's session (scenario, release, seed, UI flags). Does not create a session",
        response: { 200: StateSchema, 400: ErrorSchema },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "none", async ({ session, engine }) =>
        stateOf(deps, session, engine, req),
      ),
  );

  r.put(
    "/__arena/scenario",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["arena"],
        summary:
          "Activate a scenario on the caller's session (creating it). A new scenario or rngSeed resets the data; only a new release keeps it",
        body: z.object({
          id: z.string(),
          release: z.string().optional(),
          rngSeed: z.number().int().nonnegative().optional(),
        }),
        response: { 200: StateSchema, ...errors(400, 403, 404), 503: ErrorSchema },
      },
    },
    async (req, reply) => {
      mustOperate(deps, req);
      const scenario = activatable(deps, req.body.id);
      const { release, rngSeed } = req.body;
      if (release !== undefined && !scenario.releases.some((x) => x.id === release)) {
        throw badRequest("invalid_release", "Unknown release for this scenario");
      }
      const sid = resolveSessionId(req, reply, deps.config);
      // Born with the requested scenario, so a new session is not seeded twice.
      const current = await ensureSession(deps.db, sid, {
        ...ensureOptions(deps, req),
        scenario,
        release,
        rngSeed,
      });
      const same = current.scenario === scenario.id;
      const next = await setScenario(
        deps.db,
        sid,
        scenario,
        {
          release: release ?? (same ? current.release : null),
          rngSeed: rngSeed ?? (same ? current.rngSeed : null),
        },
        (id) => scenarioOf(deps, id),
      );
      const engine = engineFor(next, deps);
      if (!deps.config.ARENA_RUNNER_MODE) reply.header(RELEASE_HEADER, engine.release ?? "none");
      return stateOf(deps, next, engine, req);
    },
  );

  r.post(
    "/__arena/reset",
    {
      // Stricter than the global limit; only enforced when the hosted rate limiter is registered.
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        tags: ["arena"],
        summary:
          "Reset ONLY the caller's session data and counters to its scenario's seed, keeping scenario, release and rng seed (header X-Arena-Session or cookie). Other sessions are untouched.",
        response: {
          200: z.object({ session: z.string(), seedVersion: z.string() }),
          400: ErrorSchema,
        },
      },
    },
    async (req, reply) => {
      mustOperate(deps, req);
      const id = resolveSessionId(req, reply, deps.config);
      await ensureSession(deps.db, id, ensureOptions(deps, req));
      const s = await resetSession(deps.db, id, (sid) => scenarioOf(deps, sid));
      const engine = engineFor(s, deps);
      if (!deps.config.ARENA_RUNNER_MODE) reply.header(RELEASE_HEADER, engine.release ?? "none");
      const scenario = scenarioOf(deps, engine.scenarioId);
      return seesEverything(deps, req)
        ? { session: s.id, seedVersion: seedVersionOf(scenario.seed.variant, engine.rngSeed) }
        : { session: "runner", seedVersion: "none" };
    },
  );

  r.get(
    "/__arena/requirements",
    {
      schema: {
        tags: ["arena"],
        summary: "Requirements document of the effective release (never includes the answer key)",
        response: {
          200: z.object({
            title: z.string(),
            version: z.string(),
            items: z.array(z.object({ id: z.string(), source: z.string(), text: z.string() })),
          }),
          ...errors(400, 404),
        },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "none", async ({ engine }) => {
        const requirements = seesEverything(deps, req) ? engine.requirements() : null;
        if (!requirements) throw new HttpError(404, "no_requirements", "No requirements here");
        return requirements;
      }),
  );

  r.put(
    "/__arena/assistant",
    {
      schema: {
        tags: ["arena"],
        summary:
          "Set the assistant mode for this session (normal or faulty) and which faults apply",
        body: z.object({
          mode: z.enum(["normal", "faulty"]),
          faults: z.array(z.enum(FAULTS)).optional(),
        }),
        response: { 200: StateSchema, 400: ErrorSchema },
      },
    },
    async (req, reply) => {
      mustOperate(deps, req);
      const id = resolveSessionId(req, reply, deps.config);
      await ensureSession(deps.db, id, ensureOptions(deps, req));
      const next: AssistantSettings = {
        mode: req.body.mode,
        faults: req.body.faults ?? [...FAULTS],
      };
      const s = await updateSettings(deps.db, id, { assistant: next });
      const engine = engineFor(s, deps);
      if (!deps.config.ARENA_RUNNER_MODE) reply.header(RELEASE_HEADER, engine.release ?? "none");
      return stateOf(deps, s, engine, req);
    },
  );

  r.post(
    "/api/assistant/chat",
    {
      schema: {
        tags: ["assistant"],
        summary:
          "Shopping assistant chat (deterministic stub by default; LLM if ASSISTANT_API_KEY is set)",
        security: [{ bearerAuth: [] }, {}],
        body: z.object({ message: z.string().min(1).max(500) }),
        response: {
          200: z.object({
            reply: z.string(),
            products: z.array(
              z.object({ id: z.number(), name: z.string(), priceCents: z.number() }),
            ),
            mode: z.enum(["normal", "faulty"]),
            engine: z.enum(["stub", "llm"]),
          }),
          ...errors(400),
        },
      },
    },
    (req, reply) =>
      run(deps, req, reply, "none", async ({ q, session, user, engine }) => {
        // Faults from `PUT /__arena/assistant` plus the scenario's `assistant.*` defects.
        const configured = assistantOf(session.settings);
        const faults = FAULTS.filter(
          (f) =>
            (configured.mode === "faulty" && configured.faults.includes(f)) ||
            engine.isActive(`assistant.${f}`),
        );
        const settings: AssistantSettings = { mode: faults.length ? "faulty" : "normal", faults };
        if (deps.config.ASSISTANT_API_KEY) {
          const catalog = await loadCatalog(q);
          const summary = catalog
            .map(
              (p) => `#${p.id} ${p.name} ${(p.price_cents / 100).toFixed(2)} USD stock=${p.stock}`,
            )
            .join("\n");
          const llm = await llmAssistant(
            deps.config,
            deps.fetchImpl,
            req.body.message,
            settings,
            summary,
          );
          if (llm) return llm;
        }
        return stubAssistant(q, req.body.message, settings, user?.id ?? null);
      }),
  );
}
