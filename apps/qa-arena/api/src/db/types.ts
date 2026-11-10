export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Runs one or more statements without parameters. */
  exec(sql: string): Promise<void>;
}

export interface Database {
  /** Runs `fn` inside a transaction. The default search_path applies. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Runs `fn` in a transaction with search_path pointing at one session schema. */
export async function inSchema<T>(
  db: Database,
  schema: string,
  fn: (q: Queryable) => Promise<T>,
): Promise<T> {
  return db.tx(async (q) => {
    if (!/^s_[0-9a-f]{24}$/.test(schema)) throw new Error("invalid schema name");
    await q.exec(`SET LOCAL search_path TO ${schema}, public`);
    return fn(q);
  });
}
