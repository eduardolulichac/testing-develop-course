import { PGlite } from "@electric-sql/pglite";
import type { Database, Queryable } from "./types.js";

/** In-process Postgres (WASM) used by the tests so they need no Docker. */
export function createPgliteDatabase(): Database {
  const lite = new PGlite();
  return {
    async tx(fn) {
      return lite.transaction(async (tx) => {
        const q: Queryable = {
          async query<T>(text: string, params?: unknown[]) {
            const res = await tx.query(text, params);
            return { rows: res.rows as T[] };
          },
          async exec(sql: string) {
            await tx.exec(sql);
          },
        };
        return fn(q);
      });
    },
    close: () => lite.close(),
  };
}
