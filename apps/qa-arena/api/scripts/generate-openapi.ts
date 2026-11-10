import { writeFileSync } from "node:fs";
import { buildApp } from "../src/app.js";
import { testConfig } from "../src/config.js";
import type { Database } from "../src/db/types.js";

// The spec does not need a database: routes are only registered, never called.
const noDb: Database = {
  tx: () => Promise.reject(new Error("not available")),
  close: async () => undefined,
};
const app = await buildApp({ db: noDb, config: testConfig });
await app.ready();
writeFileSync(
  new URL("../openapi.json", import.meta.url),
  JSON.stringify(app.swagger(), null, 2) + "\n",
);
await app.close();
console.log("openapi.json written");
