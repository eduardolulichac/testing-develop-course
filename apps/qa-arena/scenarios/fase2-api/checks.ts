import type { ArenaClient, Confirmer } from "@course/scenario-engine";
import { addToCart, emptyCart, loginAna, logout } from "../helpers.ts";

type ConfirmResult = Awaited<ReturnType<Confirmer>>;

/**
 * Each check reports whether ONE defect is visible; `fase2-api` and the eval scenarios reuse them.
 * These files are bundled into the PUBLIC evaluator: the evidence is deliberately generic (no
 * status, id or limit that would describe the defect). To debug a check, log from the caller.
 */
const verdict = (n: number, present: boolean): ConfirmResult => ({
  present,
  evidence: `comprobación ${n}: ${present ? "observada" : "no observada"}`,
});

export async function checkPaginationOverlap(c: ArenaClient): Promise<ConfirmResult> {
  const p1 = await c.request("GET", "/api/products?page=1&pageSize=5");
  const p2 = await c.request("GET", "/api/products?page=2&pageSize=5");
  const a = p1.body?.items as Array<{ id: number }>;
  const b = p2.body?.items as Array<{ id: number }>;
  const last = Array.isArray(a) ? a[a.length - 1]?.id : undefined;
  const first = Array.isArray(b) ? b[0]?.id : undefined;
  return verdict(1, last !== undefined && last === first);
}

export async function checkWrongStatus(c: ArenaClient): Promise<ConfirmResult> {
  const token = await loginAna(c);
  await emptyCart(c, token, 11);
  const r = await addToCart(c, token, 11, 6);
  return verdict(2, r.status === 500);
}

export async function checkLogoutKeepsToken(c: ArenaClient): Promise<ConfirmResult> {
  const token = await loginAna(c);
  const out = await logout(c, token);
  const me = await c.request("GET", "/api/auth/me", { token });
  return verdict(3, out.status === 204 && me.status === 200);
}

export async function checkContractDrift(c: ArenaClient): Promise<ConfirmResult> {
  const r = await c.request("GET", "/api/products/1");
  const type = typeof r.body?.priceCents;
  return verdict(4, type === "string");
}

export async function checkQuantityLimit(c: ArenaClient): Promise<ConfirmResult> {
  const token = await loginAna(c);
  await emptyCart(c, token, 3);
  await addToCart(c, token, 3, 6);
  const second = await addToCart(c, token, 3, 6);
  return verdict(5, second.status === 200);
}
