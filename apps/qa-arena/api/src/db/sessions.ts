import { createHash } from "node:crypto";
import type { Scenario } from "@course/scenario-engine";
import { HttpError } from "../errors.js";
import { META_DDL, SESSION_DDL } from "./ddl.js";
import { refreshQaViews } from "./qa-views.js";
import { seed, SEED_VERSION } from "./seed.js";
import { seedDirty } from "./seed-dirty.js";
import { inSchema, type Database, type Queryable } from "./types.js";

export const DEFAULT_SESSION = "default";
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface SessionInfo {
  id: string;
  schema: string;
  scenario: string;
  /** Selected release id; null = the scenario's default. */
  release: string | null;
  /** Override of the scenario's rng seed; null = the scenario's own. */
  rngSeed: number | null;
  settings: Record<string, unknown>;
}

export function isValidSessionId(id: string): boolean {
  return SESSION_ID_RE.test(id);
}

export function schemaFor(sessionId: string): string {
  return `s_${createHash("sha256").update(sessionId).digest("hex").slice(0, 24)}`;
}

export async function initMeta(db: Database): Promise<void> {
  await db.tx(async (q) => q.exec(META_DDL));
}

/** The rng seed that drives a session's faults and dirty seed. */
export const effectiveRngSeed = (scenario: Scenario, rngSeed: number | null) =>
  rngSeed ?? scenario.seed.rngSeed;

/** Creates and seeds a session schema; with no scenario, the clean baseline seed. */
async function createSessionSchema(
  q: Queryable,
  schema: string,
  scenario: Scenario | null,
  rngSeed: number | null = null,
): Promise<void> {
  await q.exec(`CREATE SCHEMA ${schema}`);
  await q.exec(`SET LOCAL search_path TO ${schema}, public`);
  await q.exec(SESSION_DDL);
  await seed(q);
  if (scenario) await applyScenario(q, scenario, rngSeed);
  await refreshStudentViews(q, schema);
}

async function applyScenario(q: Queryable, scenario: Scenario, rngSeed: number | null) {
  if (scenario.seed.variant === "dirty") await seedDirty(q, effectiveRngSeed(scenario, rngSeed));
  const patch = scenario.seed.patch;
  for (const [id, stock] of Object.entries(patch?.stock ?? {})) {
    await q.query("UPDATE inventory SET stock = $2 WHERE product_id = $1", [Number(id), stock]);
  }
  for (const [code, active] of Object.entries(patch?.couponsActive ?? {})) {
    await q.query("UPDATE coupons SET active = $2 WHERE code = $1", [code, active]);
  }
}

/** The students' read-only `tienda` views follow the shared (default) session only. */
async function refreshStudentViews(q: Queryable, schema: string): Promise<void> {
  if (schema === schemaFor(DEFAULT_SESSION)) await refreshQaViews(q, schema);
}

interface Row {
  id: string;
  schema_name: string;
  scenario: string;
  release: string | null;
  rng_seed: number | null;
  settings: Record<string, unknown>;
}

const toInfo = (r: Row): SessionInfo => ({
  id: r.id,
  schema: r.schema_name,
  scenario: r.scenario,
  release: r.release,
  rngSeed: r.rng_seed,
  settings: r.settings,
});

export interface EnsureOptions {
  /** Hard cap on the total number of sessions: beyond it new visitors get 503, nobody is evicted. */
  maxSessions: number;
  maxPerIp: number;
  /** Hash of the caller's IP; when set, the per-IP quota applies. */
  ipHash?: string;
  /** Scenario a brand-new session is born with (existing sessions keep theirs). */
  scenario: Scenario;
  release?: string | null;
  rngSeed?: number | null;
}

/** Schema holding the baseline seed that anonymous reads are served from (read only). */
export const TEMPLATE_SCHEMA = "s_template";

/** Session shown for anonymous reads: no row exists, nothing is created. */
export const TEMPLATE_SESSION: SessionInfo = {
  id: "",
  schema: TEMPLATE_SCHEMA,
  scenario: "baseline",
  release: null,
  rngSeed: null,
  settings: {},
};

/** (Re)builds the template schema from the current seed. Call once at startup. */
export async function initTemplate(db: Database): Promise<void> {
  await db.tx(async (q) => {
    await q.exec(`DROP SCHEMA IF EXISTS ${TEMPLATE_SCHEMA} CASCADE`);
    await createSessionSchema(q, TEMPLATE_SCHEMA, null);
  });
}

/** Runs `fn` against the template in a read-only transaction. */
export async function inTemplate<T>(db: Database, fn: (q: Queryable) => Promise<T>): Promise<T> {
  return db.tx(async (q) => {
    await q.exec("SET TRANSACTION READ ONLY");
    await q.exec(`SET LOCAL search_path TO ${TEMPLATE_SCHEMA}, public`);
    return fn(q);
  });
}

/**
 * Returns the session, creating (and seeding) its schema on first use. Creation is serialized
 * by a global advisory lock, so the count checks cannot race. Over the per-IP quota the
 * caller's oldest session of that same IP is evicted; over the total cap it is `503 arena_full`.
 */
export async function ensureSession(
  db: Database,
  id: string,
  opts: EnsureOptions,
): Promise<SessionInfo> {
  const schema = schemaFor(id);
  return db.tx(async (q) => {
    await q.query("SELECT pg_advisory_xact_lock(hashtext($1))", [id]);
    const found = await q.query<Row>(
      "UPDATE arena_meta.sessions SET last_seen = now() WHERE id = $1 RETURNING *",
      [id],
    );
    if (found.rows[0]) return toInfo(found.rows[0]);

    await q.query("SELECT pg_advisory_xact_lock(hashtext('arena:create'))");
    if (opts.ipHash) {
      const mine = await q.query<{ id: string; schema_name: string }>(
        "SELECT id, schema_name FROM arena_meta.sessions WHERE owner_ip_hash = $1 ORDER BY last_seen",
        [opts.ipHash],
      );
      const excess = mine.rows.length - (opts.maxPerIp - 1);
      for (const old of mine.rows.slice(0, Math.max(0, excess))) {
        await q.query("SELECT pg_advisory_xact_lock(hashtext($1))", [old.id]);
        await q.query("DELETE FROM arena_meta.sessions WHERE id = $1", [old.id]);
        await q.exec(`DROP SCHEMA IF EXISTS ${old.schema_name} CASCADE`);
      }
    }
    const count = await q.query<{ n: string }>("SELECT count(*) AS n FROM arena_meta.sessions");
    if (Number(count.rows[0]?.n ?? 0) >= opts.maxSessions) {
      throw new HttpError(503, "arena_full", "The Arena is full right now, try again later");
    }
    await createSessionSchema(q, schema, opts.scenario, opts.rngSeed ?? null);
    const ins = await q.query<Row>(
      `INSERT INTO arena_meta.sessions (id, schema_name, owner_ip_hash, scenario, release, rng_seed)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        id,
        schema,
        opts.ipHash ?? null,
        opts.scenario.id,
        opts.release ?? null,
        opts.rngSeed ?? null,
      ],
    );
    return toInfo(ins.rows[0]!);
  });
}

/** Looks a session up without touching `last_seen` or creating it. */
export async function findSession(db: Database, id: string): Promise<SessionInfo | null> {
  return db.tx(async (q) => {
    const r = await q.query<Row>("SELECT * FROM arena_meta.sessions WHERE id = $1", [id]);
    return r.rows[0] ? toInfo(r.rows[0]) : null;
  });
}

/** Drops the session's data and rebuilds it from `scenario`'s seed; counters go back to zero. */
async function rebuild(
  q: Queryable,
  info: { id: string; schema: string },
  scenario: Scenario,
  rngSeed: number | null,
): Promise<void> {
  await q.exec(`DROP SCHEMA IF EXISTS ${info.schema} CASCADE`);
  await createSessionSchema(q, info.schema, scenario, rngSeed);
  await q.query("DELETE FROM arena_meta.fault_counters WHERE session_id = $1", [info.id]);
}

/**
 * Resets ONLY this session's data and counters to its scenario's seed, keeping scenario,
 * release and rng seed. Other sessions are untouched. The session must already exist.
 */
export async function resetSession(
  db: Database,
  id: string,
  scenarioOf: (scenarioId: string) => Scenario,
): Promise<SessionInfo> {
  return db.tx(async (q) => {
    await q.query("SELECT pg_advisory_xact_lock(hashtext($1))", [id]);
    const found = await q.query<Row>("SELECT * FROM arena_meta.sessions WHERE id = $1", [id]);
    const row = found.rows[0];
    if (!row) throw new HttpError(404, "no_session", "Session not found");
    await rebuild(q, { id, schema: row.schema_name }, scenarioOf(row.scenario), row.rng_seed);
    const upd = await q.query<Row>(
      `UPDATE arena_meta.sessions SET settings = '{}'::jsonb, last_seen = now()
        WHERE id = $1 RETURNING *`,
      [id],
    );
    return toInfo(upd.rows[0]!);
  });
}

/**
 * Activates `scenario` on the session. A different scenario or rng seed rebuilds the data and
 * zeroes the counters; changing only the release keeps the data ("a deploy doesn't wipe the DB").
 */
export async function setScenario(
  db: Database,
  id: string,
  scenario: Scenario,
  choice: { release: string | null; rngSeed: number | null },
  scenarioOf: (scenarioId: string) => Scenario,
): Promise<SessionInfo> {
  return db.tx(async (q) => {
    await q.query("SELECT pg_advisory_xact_lock(hashtext($1))", [id]);
    const found = await q.query<Row>("SELECT * FROM arena_meta.sessions WHERE id = $1", [id]);
    const row = found.rows[0];
    if (!row) throw new HttpError(404, "no_session", "Session not found");
    const before = scenarioOf(row.scenario);
    const changed =
      row.scenario !== scenario.id ||
      effectiveRngSeed(before, row.rng_seed) !== effectiveRngSeed(scenario, choice.rngSeed);
    if (changed) {
      await rebuild(q, { id, schema: row.schema_name }, scenario, choice.rngSeed);
    }
    const upd = await q.query<Row>(
      `UPDATE arena_meta.sessions
          SET scenario = $2, release = $3, rng_seed = $4, last_seen = now()
        WHERE id = $1 RETURNING *`,
      [id, scenario.id, choice.release, choice.rngSeed],
    );
    return toInfo(upd.rows[0]!);
  });
}

/**
 * Counts a call at a route injection point and returns its 0-based index. Runs in its OWN
 * transaction, before the handler's: if it shared the handler's, rolling back the injected 5xx
 * would undo the count and the same call would fail forever.
 */
export async function nextFaultIndex(db: Database, id: string, point: string): Promise<number> {
  return db.tx(async (q) => {
    const r = await q.query<{ n: number }>(
      `INSERT INTO arena_meta.fault_counters (session_id, point, n) VALUES ($1, $2, 1)
       ON CONFLICT (session_id, point) DO UPDATE SET n = fault_counters.n + 1 RETURNING n`,
      [id, point],
    );
    return r.rows[0]!.n - 1;
  });
}

export async function updateSettings(
  db: Database,
  id: string,
  patch: Record<string, unknown>,
): Promise<SessionInfo> {
  return db.tx(async (q) => {
    const r = await q.query<Row>(
      "UPDATE arena_meta.sessions SET settings = settings || $2::jsonb WHERE id = $1 RETURNING *",
      [id, JSON.stringify(patch)],
    );
    return toInfo(r.rows[0]!);
  });
}

export async function purgeExpired(db: Database, ttlMinutes: number): Promise<number> {
  return db.tx(async (q) => {
    const r = await q.query<{ schema_name: string }>(
      "DELETE FROM arena_meta.sessions WHERE last_seen < now() - make_interval(mins => $1) RETURNING schema_name",
      [ttlMinutes],
    );
    for (const row of r.rows) await q.exec(`DROP SCHEMA IF EXISTS ${row.schema_name} CASCADE`);
    return r.rows.length;
  });
}

export { inSchema, SEED_VERSION };
