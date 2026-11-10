import type { Confirmer } from "@course/scenario-engine";
import { loginAna } from "../helpers.ts";

/**
 * Luis's "old device" session, expired since 2026-01-01. It must match `SEED_EXPIRED_TOKEN` in
 * `api/src/db/seed.ts` (the scenarios package cannot import from the API). If they drift, the
 * differential harness fails: on the baseline it would answer 401 either way and the scenario
 * would never see the defect.
 */
const EXPIRED_TOKEN = "luis-old-device-expired-token-0001";

/**
 * Authorization checks only, with the seeded data of the session. No payloads, no SQL: the three
 * defects are visible from the status code of a plain, well-formed request.
 */
const confirm: Confirmer = async (c) => {
  // 1. Broken object-level authorization: Luis reads order #1, which is Ana's.
  const luis = await c.login("luis@arena.test", "Cliente123!");
  const order = await c.request("GET", "/api/orders/1", { token: luis });
  const idor = order.status === 200 && order.body?.id === 1;

  // 2. Missing role check: a customer (Ana) can list every order through the admin API.
  const ana = await loginAna(c);
  const admin = await c.request("GET", "/api/admin/orders", { token: ana });
  const noRole = admin.status === 200;

  // 3. Expiry ignored: the expired session still authenticates a normal request.
  const old = await c.request("GET", "/api/orders", { token: EXPIRED_TOKEN });
  const neverExpires = old.status === 200;

  return {
    present: idor && noRole && neverExpires,
    evidence: `order of another user -> ${order.status}; admin API as customer -> ${admin.status}; expired token -> ${old.status}`,
  };
};
export default confirm;
