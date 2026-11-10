import { z } from "zod";

// Number of proxy hops to trust for `req.ip`. A boolean `true` would trust every X-Forwarded-For
// entry, which the client controls (review H20), so only a hop count is accepted.
const proxyHops = z
  .string()
  .regex(/^(false|\d+)$/, "Número de saltos de proxy de confianza (0 o false = ninguno)")
  .transform((v) => (v === "false" ? 0 : Number(v)));

const schema = z
  .object({
    NODE_ENV: z.string().optional(),
    DATABASE_URL: z.string().min(1),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    API_HOST: z.string().default("0.0.0.0"),
    ARENA_SESSION_TTL_MINUTES: z.coerce.number().int().min(1).default(240),
    ARENA_MAX_SESSIONS: z.coerce.number().int().min(1).default(500),
    // Optional here so production can demand them explicitly; defaults are applied below.
    ARENA_SESSION_MODE: z.enum(["shared", "per-visitor"]).optional(),
    ARENA_DEPLOYMENT: z.enum(["local", "ephemeral", "hosted"]).optional(),
    ARENA_COOKIE_SECRET: z.string().min(32).optional(),
    ARENA_MAX_SESSIONS_PER_IP: z.coerce.number().int().min(1).default(3),
    ARENA_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(120),
    ARENA_TRUST_PROXY: proxyHops.default(0),
    ARENA_DEFAULT_SCENARIO: z.string().optional(),
    // Runner mode (evaluator and template Arenas): the API stops sending headers that reveal the
    // scenario or its defects and tells the web to hide its scenario controls. Off by default.
    ARENA_RUNNER_MODE: z
      .enum(["1", "true", "0", "false", ""])
      .default("0")
      .transform((v) => v === "1" || v === "true"),
    // Per-run secret of the evaluator (runner mode only). With it the caller sees the full
    // `/__arena/state` and may switch scenarios; without it the state is the minimal view the web
    // needs to paint and the operations are rejected (403). Unset = template Arenas (open operations).
    ARENA_RUNNER_TOKEN: z.string().min(32, "Mínimo 32 caracteres").optional(),
    ASSISTANT_API_KEY: z.string().optional(),
    ASSISTANT_MODEL: z.string().optional(),
    ASSISTANT_API_URL: z.string().url().default("https://api.anthropic.com/v1/messages"),
  })
  .superRefine((c, ctx) => {
    if (c.ARENA_RUNNER_TOKEN && !c.ARENA_RUNNER_MODE) {
      ctx.addIssue({
        code: "custom",
        path: ["ARENA_RUNNER_TOKEN"],
        message: "Solo tiene sentido con ARENA_RUNNER_MODE=1",
      });
    }
    // Review H6: a hosted Arena deployed without these would silently share one session.
    if (c.NODE_ENV === "production") {
      for (const key of ["ARENA_SESSION_MODE", "ARENA_DEPLOYMENT"] as const) {
        if (!c[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "Obligatoria con NODE_ENV=production",
          });
        }
      }
    }
    if (c.ARENA_DEPLOYMENT === "hosted") {
      if (c.ARENA_SESSION_MODE !== "per-visitor") {
        ctx.addIssue({
          code: "custom",
          path: ["ARENA_SESSION_MODE"],
          message: "Con ARENA_DEPLOYMENT=hosted debe ser per-visitor",
        });
      }
      if (!c.ARENA_COOKIE_SECRET) {
        ctx.addIssue({
          code: "custom",
          path: ["ARENA_COOKIE_SECRET"],
          message: "Obligatoria con ARENA_DEPLOYMENT=hosted (mínimo 32 caracteres)",
        });
      }
    }
  })
  .transform((c) => ({
    ...c,
    ARENA_SESSION_MODE: c.ARENA_SESSION_MODE ?? ("shared" as const),
    ARENA_DEPLOYMENT: c.ARENA_DEPLOYMENT ?? ("local" as const),
  }));

export type Config = z.output<typeof schema>;

const EMPTY_AS_UNSET = [
  "ASSISTANT_API_KEY",
  "ASSISTANT_MODEL",
  "ARENA_COOKIE_SECRET",
  "ARENA_DEFAULT_SCENARIO",
  "ARENA_RUNNER_TOKEN",
] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse({
    ...env,
    // docker compose passes unset variables as empty strings
    ...Object.fromEntries(EMPTY_AS_UNSET.map((k) => [k, env[k] || undefined])),
  });
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** Defaults for tests: no external services. */
export const testConfig: Config = {
  DATABASE_URL: "pglite://memory",
  API_PORT: 0,
  API_HOST: "127.0.0.1",
  ARENA_SESSION_TTL_MINUTES: 240,
  ARENA_MAX_SESSIONS: 500,
  ARENA_SESSION_MODE: "shared",
  ARENA_DEPLOYMENT: "local",
  ARENA_MAX_SESSIONS_PER_IP: 3,
  ARENA_RATE_LIMIT_PER_MIN: 120,
  ARENA_TRUST_PROXY: 0,
  ARENA_RUNNER_MODE: false,
  ASSISTANT_API_URL: "https://api.anthropic.com/v1/messages",
};
