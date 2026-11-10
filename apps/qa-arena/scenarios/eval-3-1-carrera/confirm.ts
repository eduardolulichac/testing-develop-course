import type { Confirmer } from "@course/scenario-engine";
import { addToCart, emptyCart, loginAna } from "../helpers.ts";

/**
 * A race cannot show up in PGlite (the unit-test database), which runs transactions one after
 * another, so `api/test/scenarios.test.ts` skips this confirmer. It is checked against a real
 * Postgres instead.
 */
export const requiresPostgres = true;

const VALID_CHECKOUT = {
  payment: { cardNumber: "4242424242424242", expMonth: 12, expYear: 2099, cvc: "123" },
  shippingAddress: "Av. Siempre Viva 123",
};

/**
 * Three simultaneous checkouts of ONE cart that holds exactly the whole stock (2 units). With the
 * check and the decrement as separate steps (and a 1 s gap between them) every one of them passes
 * the check, so at least two answer 201 and the same 2 units are sold more than once. On a healthy
 * Arena only the first can win. Evidence is generic: this file is bundled into the public evaluator.
 */
const confirm: Confirmer = async (c) => {
  const admin = await c.login("admin@arena.test", "Admin123!");
  await c.request("PUT", "/api/admin/inventory/1", { token: admin, body: { stock: 2 } });
  const ana = await loginAna(c);
  await emptyCart(c, ana, 1);
  await addToCart(c, ana, 1, 2);
  const results = await Promise.all(
    [1, 2, 3].map(() => c.request("POST", "/api/checkout", { token: ana, body: VALID_CHECKOUT })),
  );
  const present = results.filter((r) => r.status === 201).length >= 2;
  return { present, evidence: `comprobación 1: ${present ? "observada" : "no observada"}` };
};
export default confirm;
