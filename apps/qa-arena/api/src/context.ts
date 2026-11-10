import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Effect, Engine, Registry } from "@course/scenario-engine";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "./config.js";
import { inSchema, type Database, type Queryable } from "./db/types.js";
import {
  DEFAULT_SESSION,
  ensureSession,
  inTemplate,
  isValidSessionId,
  TEMPLATE_SESSION,
  type EnsureOptions,
  type SessionInfo,
} from "./db/sessions.js";
import { engineFor, NO_EFFECT, scenarioOf } from "./engine.js";
import { badRequest, forbidden, unauthorized } from "./errors.js";
import { hashToken } from "./security.js";

declare module "fastify" {
  interface FastifyRequest {
    /** The session's engine, set by `run()` so response hooks (`onSend`) can consult it. */
    arenaEngine?: Engine;
  }
}

export const SESSION_HEADER = "x-arena-session";
export const SESSION_COOKIE = "arena_session";
export const RELEASE_HEADER = "X-Arena-Release";
export const RUNNER_TOKEN_HEADER = "x-arena-runner-token";

const digest = (v: string) => createHash("sha256").update(v).digest();

/**
 * Runner mode (evaluator): is the caller the evaluator? Only a request carrying the per-run
 * token is. False when no token is configured (template Arenas have none: nobody is "the
 * evaluator" there, and the state stays minimal).
 */
export function isEvaluator(config: Config, req: FastifyRequest): boolean {
  const expected = config.ARENA_RUNNER_TOKEN;
  if (!expected) return false;
  const given = req.headers[RUNNER_TOKEN_HEADER];
  const value = Array.isArray(given) ? given[0] : given;
  return typeof value === "string" && timingSafeEqual(digest(value), digest(expected));
}

export interface Deps {
  db: Database;
  config: Config;
  fetchImpl: typeof fetch;
  registry: Registry;
  /** Engine cache, see `engineFor`. */
  engines: Map<string, Engine>;
  /** Injected delays go through here so tests can skip the wait. */
  sleep: (ms: number) => Promise<void>;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "customer" | "admin";
}

export interface Ctx {
  q: Queryable;
  session: SessionInfo;
  user: AuthUser | null;
  reply: FastifyReply;
  engine: Engine;
  sleep: Deps["sleep"];
  /**
   * Counts a call at an injection point that lives inside the handler's transaction and returns
   * what the engine decides for it. Never throws; a no-op when no fault is active there.
   */
  tick(point: string): Promise<Effect>;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The id the caller presents, or null. A cookie with a bad signature counts as absent. */
function presentedId(req: FastifyRequest, config: Config): string | null {
  // Runner mode: the student's code must not pick its session. A fresh id would be born in
  // baseline and the test could diff it against the shared session to detect any scenario.
  if (config.ARENA_RUNNER_MODE && !isEvaluator(config, req)) return null;
  // Hosted: never trust a client-chosen id (header), only the signed cookie (review H6).
  const header = config.ARENA_DEPLOYMENT === "hosted" ? undefined : req.headers[SESSION_HEADER];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  if (fromHeader) return fromHeader;

  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw) return null;
  if (!config.ARENA_COOKIE_SECRET) return raw;
  const unsigned = req.unsignCookie(raw);
  return unsigned.valid && unsigned.value && UUID_V4.test(unsigned.value) ? unsigned.value : null;
}

function issueSession(reply: FastifyReply, config: Config): string {
  const fresh = randomUUID();
  reply.setCookie(SESSION_COOKIE, fresh, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.ARENA_DEPLOYMENT === "hosted",
    signed: Boolean(config.ARENA_COOKIE_SECRET),
  });
  return fresh;
}

function checked(id: string): string {
  if (!isValidSessionId(id)) throw badRequest("invalid_session", "Invalid session id");
  return id;
}

/**
 * Session id for a request that may create the session (writes): the presented one, a fresh
 * one per visitor, or the single shared session.
 */
export function resolveSessionId(req: FastifyRequest, reply: FastifyReply, config: Config): string {
  const id = presentedId(req, config);
  if (id) return checked(id);
  return config.ARENA_SESSION_MODE === "per-visitor"
    ? issueSession(reply, config)
    : DEFAULT_SESSION;
}

/** Like `resolveSessionId` but never creates: null for an anonymous per-visitor read. */
export function peekSessionId(req: FastifyRequest, config: Config): string | null {
  const id = presentedId(req, config);
  if (id) return checked(id);
  return config.ARENA_SESSION_MODE === "per-visitor" ? null : DEFAULT_SESSION;
}

/** Quota and cap settings for `ensureSession`; the per-IP quota only applies per visitor. */
export function ensureOptions(deps: Deps, req: FastifyRequest): EnsureOptions {
  const { config } = deps;
  return {
    maxSessions: config.ARENA_MAX_SESSIONS,
    maxPerIp: config.ARENA_MAX_SESSIONS_PER_IP,
    scenario: scenarioOf(deps, config.ARENA_DEFAULT_SCENARIO ?? "baseline"),
    ipHash:
      config.ARENA_SESSION_MODE === "per-visitor"
        ? createHash("sha256")
            .update(req.ip + (config.ARENA_COOKIE_SECRET ?? ""))
            .digest("hex")
        : undefined,
  };
}

export type AuthLevel = "none" | "user" | "admin";

export async function run<T>(
  deps: Deps,
  req: FastifyRequest,
  reply: FastifyReply,
  auth: AuthLevel,
  fn: (ctx: Ctx) => Promise<T>,
): Promise<T> {
  const write = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const id = write ? resolveSessionId(req, reply, deps.config) : peekSessionId(req, deps.config);

  const withUser = async (q: Queryable, session: SessionInfo) => {
    const engine = engineFor(session, deps);
    req.arenaEngine = engine;
    let user: AuthUser | null = null;
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
    if (m) {
      // `security.token_never_expires`: the expiry date is ignored.
      const expiry = engine.isActive("security.token_never_expires")
        ? ""
        : "AND t.expires_at > now()";
      const r = await q.query<AuthUser>(
        `SELECT u.id, u.email, u.name, u.role FROM tokens t JOIN users u ON u.id = t.user_id
          WHERE t.token_hash = $1 ${expiry}`,
        [hashToken(m[1]!)],
      );
      user = r.rows[0] ?? null;
    }
    if (auth !== "none" && !user) throw unauthorized();
    // `security.admin_no_role`: any logged-in user passes the admin check.
    if (auth === "admin" && user?.role !== "admin" && !engine.isActive("security.admin_no_role")) {
      throw forbidden("Admin role required");
    }
    if (!deps.config.ARENA_RUNNER_MODE) reply.header(RELEASE_HEADER, engine.release ?? "none");
    const tick = async (point: string): Promise<Effect> => {
      // The template is read-only and baseline has no faults, so there is nothing to count.
      if (!session.id || engine.faultsAt(point).length === 0) return NO_EFFECT;
      const r = await q.query<{ n: number }>(
        `INSERT INTO arena_counters (point, n) VALUES ($1, 1)
         ON CONFLICT (point) DO UPDATE SET n = arena_counters.n + 1 RETURNING n`,
        [point],
      );
      return engine.decide(point, r.rows[0]!.n - 1);
    };
    return fn({ q, session, user, reply, engine, tick, sleep: deps.sleep });
  };

  // Anonymous read: served from the read-only template, no session is created.
  if (id === null) return inTemplate(deps.db, (q) => withUser(q, TEMPLATE_SESSION));

  const session = await ensureSession(deps.db, id, ensureOptions(deps, req));
  return inSchema(deps.db, session.schema, (q) => withUser(q, session));
}
