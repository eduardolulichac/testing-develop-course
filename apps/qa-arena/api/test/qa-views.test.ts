import { defineScenario } from "@course/scenario-engine";
import { afterEach, describe, expect, it } from "vitest";
import { createPgliteDatabase } from "../src/db/pglite.js";
import {
  DEFAULT_SESSION,
  ensureSession,
  initMeta,
  resetSession,
  schemaFor,
} from "../src/db/sessions.js";
import type { Database } from "../src/db/types.js";

const baseline = () =>
  defineScenario({
    id: "baseline",
    title: "Base",
    module: "0.1",
    publicSummary: "Base",
    seed: { rngSeed: 835 },
  });

describe("tienda views for arena_qa", () => {
  let db: Database;
  afterEach(() => db.close());

  async function setup(withInit: boolean) {
    db = createPgliteDatabase();
    await initMeta(db);
    if (withInit) {
      // What db/init/02-qa-reader.sh does in Postgres.
      await db.tx((q) =>
        q.exec(
          `CREATE ROLE arena_qa NOSUPERUSER; CREATE SCHEMA tienda; GRANT USAGE ON SCHEMA tienda TO arena_qa`,
        ),
      );
    }
    const scenario = baseline();
    const opts = { maxSessions: 10, maxPerIp: 3, scenario };
    await ensureSession(db, DEFAULT_SESSION, opts);
    return { scenario, opts };
  }

  const asQa = <T>(sql: string) =>
    db.tx(async (q) => {
      await q.exec("SET LOCAL ROLE arena_qa");
      return q.query<T>(sql);
    });

  it("exposes the shop tables as views and never tokens or arena_counters", async () => {
    await setup(true);
    const names = await db.tx((q) =>
      q.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.views WHERE table_schema = 'tienda'",
      ),
    );
    const list = names.rows.map((r) => r.table_name);
    expect(list).toContain("orders");
    expect(list).toContain("users");
    expect(list).not.toContain("tokens");
    expect(list).not.toContain("arena_counters");
    const cols = await asQa<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'tienda' AND table_name = 'users'",
    );
    expect(cols.rows.map((c) => c.column_name)).not.toContain("password_hash");
    expect(
      (await asQa<{ n: number }>("SELECT count(*)::int AS n FROM tienda.products")).rows[0]!.n,
    ).toBeGreaterThan(0);
  });

  it("is read only and cannot reach the real tables", async () => {
    await setup(true);
    const schema = schemaFor(DEFAULT_SESSION);
    await expect(asQa(`SELECT * FROM ${schema}.users`)).rejects.toThrow(/permission denied/);
    await expect(asQa("SELECT * FROM tienda.tokens")).rejects.toThrow(/does not exist/);
    await expect(asQa("DELETE FROM tienda.orders")).rejects.toThrow(/permission denied|read-only/);
    await expect(asQa("UPDATE tienda.products SET active = false")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("recreates the views after a reset and reflects new data", async () => {
    const { scenario } = await setup(true);
    const schema = schemaFor(DEFAULT_SESSION);
    await db.tx((q) => q.exec(`UPDATE ${schema}.inventory SET stock = 7 WHERE product_id = 1`));
    const stock = () =>
      asQa<{ stock: number }>("SELECT stock FROM tienda.inventory WHERE product_id = 1");
    expect((await stock()).rows[0]!.stock).toBe(7);
    await resetSession(db, DEFAULT_SESSION, () => scenario);
    expect((await stock()).rows[0]!.stock).not.toBe(7);
    const n = await db.tx((q) =>
      q.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM information_schema.views WHERE table_schema = 'tienda'",
      ),
    );
    expect(n.rows[0]!.n).toBe(11);
  });

  it("does nothing when the tienda schema does not exist", async () => {
    await setup(false);
    const r = await db.tx((q) => q.query("SELECT to_regnamespace('tienda')::text AS ok"));
    expect((r.rows[0] as { ok: unknown }).ok).toBeNull();
  });
});
