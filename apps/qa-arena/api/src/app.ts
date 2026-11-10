import { registry as arenaRegistry } from "@arena/scenarios";
import type { Registry } from "@course/scenario-engine";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { Config } from "./config.js";
import type { Deps } from "./context.js";
import type { Database } from "./db/types.js";
import { allowsRunnerOnly } from "./engine.js";
import { HttpError } from "./errors.js";
import { faultsPlugin } from "./plugins/faults.js";
import { adminRoutes } from "./routes/admin.js";
import { arenaRoutes } from "./routes/arena.js";
import { authRoutes } from "./routes/auth.js";
import { cartRoutes } from "./routes/cart.js";
import { catalogRoutes } from "./routes/catalog.js";
import { orderRoutes } from "./routes/orders.js";

export const API_VERSION = "1.0.0";

export async function buildApp(opts: {
  db: Database;
  config: Config;
  fetchImpl?: typeof fetch;
  logger?: boolean;
  /** Test seam: defaults to the real scenario registry. */
  registry?: Registry;
  /** Test seam: replaces the real wait behind injected latency and timeouts. */
  sleep?: Deps["sleep"];
}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
    // Trust only the nearest N proxies; the entries further left of X-Forwarded-For are the client's.
    trustProxy:
      opts.config.ARENA_TRUST_PROXY > 0
        ? (_addr, hop) => hop < opts.config.ARENA_TRUST_PROXY
        : false,
  });
  const deps: Deps = {
    db: opts.db,
    config: opts.config,
    fetchImpl: opts.fetchImpl ?? fetch,
    registry: opts.registry ?? arenaRegistry,
    engines: new Map(),
    sleep: opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
  assertDefaultScenario(deps);

  // Accept an empty body with content-type JSON (e.g. POST /__arena/reset from any client).
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (body === "") return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(Object.assign(new Error("Invalid JSON body"), { statusCode: 400 }), undefined);
    }
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(
    cookie,
    opts.config.ARENA_COOKIE_SECRET ? { secret: opts.config.ARENA_COOKIE_SECRET } : {},
  );
  // Rate limiting protects the shared hosted Arena; local and ephemeral (one student) skip it.
  if (opts.config.ARENA_DEPLOYMENT === "hosted") {
    await app.register(rateLimit, {
      max: opts.config.ARENA_RATE_LIMIT_PER_MIN,
      timeWindow: "1 minute",
    });
  }
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "QA Arena API",
        description:
          "Practice shop API for the QA Automation course. Sessions: cookie arena_session (header X-Arena-Session outside the hosted Arena).",
        version: API_VERSION,
      },
      components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
        parameters: {},
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply
        .code(400)
        .send({ error: { code: "validation_error", message: "Invalid request" } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply
        .code(status)
        .send({ error: { code: "bad_request", message: (err as Error).message } });
    }
    app.log.error(err);
    return reply.code(500).send({ error: { code: "internal_error", message: "Internal error" } });
  });
  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ error: { code: "not_found", message: "Route not found" } }),
  );

  app.get("/api/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  await app.register(async (scope) => {
    faultsPlugin(scope, deps);
    arenaRoutes(scope, deps);
    authRoutes(scope, deps);
    catalogRoutes(scope, deps);
    cartRoutes(scope, deps);
    orderRoutes(scope, deps);
    adminRoutes(scope, deps);
  });
  return app;
}

/** Fails at startup if `ARENA_DEFAULT_SCENARIO` is unknown or could never run on this instance. */
function assertDefaultScenario({ config, registry }: Deps): void {
  const id = config.ARENA_DEFAULT_SCENARIO;
  if (!id) return;
  const scenario = registry.scenarios.get(id);
  if (!scenario) throw new Error(`ARENA_DEFAULT_SCENARIO: el escenario "${id}" no existe`);
  if (!scenario.hosted && !allowsRunnerOnly({ config })) {
    throw new Error(
      `ARENA_DEFAULT_SCENARIO: "${id}" tiene defectos runnerOnly; solo vale con ARENA_DEPLOYMENT=ephemeral`,
    );
  }
}
