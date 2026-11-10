import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPgDatabase } from "./db/pg.js";
import { assertUnprivilegedRole } from "./db/role.js";
import { initMeta, initTemplate, purgeExpired } from "./db/sessions.js";

const config = loadConfig();
const db = createPgDatabase(config.DATABASE_URL);

// Postgres may still be starting when the container boots.
for (let attempt = 1; ; attempt++) {
  try {
    await initMeta(db);
    await initTemplate(db);
    break;
  } catch (err) {
    if (attempt >= 30) throw err;
    console.log(`Waiting for database (${attempt})...`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

await assertUnprivilegedRole(db, config);

const app = await buildApp({ db, config, logger: true });
const timer = setInterval(
  () => purgeExpired(db, config.ARENA_SESSION_TTL_MINUTES).catch((e) => app.log.error(e)),
  60_000,
);
timer.unref();

const shutdown = async () => {
  clearInterval(timer);
  await app.close();
  await db.close();
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

await app.listen({ port: config.API_PORT, host: config.API_HOST });
