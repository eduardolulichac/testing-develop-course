import pg from "pg";
import type { Database, Queryable } from "./types.js";

function wrap(client: pg.PoolClient): Queryable {
  return {
    async query<T>(text: string, params?: unknown[]) {
      const res = await client.query(text, params);
      return { rows: res.rows as T[] };
    },
    async exec(sql: string) {
      await client.query(sql);
    },
  };
}

export function createPgDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString, max: 10 });
  return {
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(wrap(client));
        await client.query("COMMIT");
        return out;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
