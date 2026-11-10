/** Rate limit of linking and key rotation (REVISION_E3 H36). Real Postgres, service role calls. */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const pool = new pg.Pool({ connectionString: DB_URL, max: 12 });
const users = [randomUUID(), randomUUID()];

const consume = async (user: string, github: boolean) =>
  (
    await pool.query<{ r: { ok: boolean; retry_after: number } }>(
      "select public.consume_link_budget($1, $2) as r",
      [user, github],
    )
  ).rows[0]!.r;

afterAll(async () => {
  await pool.query("delete from public.webhook_rate_buckets where bucket = any($1)", [
    users.map((u) => `link:${u}`),
  ]);
  await pool.end();
});

describe("consume_link_budget", () => {
  it("allows 10 per student and hour, refuses the 11th with a retry time, and is per student", async () => {
    for (let i = 0; i < 10; i++) expect((await consume(users[0]!, false)).ok).toBe(true);
    const refused = await consume(users[0]!, false);
    expect(refused.ok).toBe(false);
    expect(refused.retry_after).toBeGreaterThanOrEqual(1);
    expect(refused.retry_after).toBeLessThanOrEqual(3600);
    expect((await consume(users[1]!, false)).ok).toBe(true);
  });

  it("20 simultaneous calls from one student let exactly 10 through", async () => {
    const user = randomUUID();
    users.push(user);
    const results = await Promise.all(Array.from({ length: 20 }, () => consume(user, false)));
    expect(results.filter((r) => r.ok)).toHaveLength(10);
  });

  it("does not touch the webhook budget (github:global) and counts GitHub calls apart", async () => {
    const before = await pool.query<{ hits: number }>(
      "select coalesce(sum(hits), 0)::int as hits from public.webhook_rate_buckets where bucket = 'github:global'",
    );
    const user = randomUUID();
    users.push(user);
    await consume(user, true);
    const after = await pool.query<{ hits: number }>(
      "select coalesce(sum(hits), 0)::int as hits from public.webhook_rate_buckets where bucket = 'github:global'",
    );
    expect(after.rows[0]!.hits).toBe(before.rows[0]!.hits);
    const link = await pool.query<{ hits: number }>(
      "select coalesce(sum(hits), 0)::int as hits from public.webhook_rate_buckets where bucket = 'github:link'",
    );
    expect(link.rows[0]!.hits).toBeGreaterThanOrEqual(1);
  });

  it("only the service role can call it", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await expect(
        client.query("select public.consume_link_budget($1, true)", [users[0]]),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
});
