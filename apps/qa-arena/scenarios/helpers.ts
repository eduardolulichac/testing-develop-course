import type { ArenaClient, Confirmer } from "@course/scenario-engine";

/** Logs in as the seeded customer and returns her token. */
export const loginAna = (c: ArenaClient) => c.login("ana@arena.test", "Cliente123!");

export async function addToCart(c: ArenaClient, token: string, productId: number, quantity = 1) {
  return c.request("POST", "/api/cart/items", { token, body: { productId, quantity } });
}

export const applyCoupon = (c: ArenaClient, token: string, code: string) =>
  c.request("POST", "/api/cart/coupon", { token, body: { code } });

export const logout = (c: ArenaClient, token: string) =>
  c.request("POST", "/api/auth/logout", { token });

export const emptyCart = (c: ArenaClient, token: string, productId: number) =>
  c.request("DELETE", `/api/cart/items/${productId}`, { token });

/**
 * Confirmer for a scenario whose defects live only in the web layer: the API cannot see them, but
 * `GET /__arena/state` announces the active `uiFlags` (backend defects are never listed there).
 * The render itself is tested in `web/src/test/ui-flags`.
 */
export const confirmUiFlags =
  (...flags: string[]): Confirmer =>
  async (c) => {
    const r = await c.request("GET", "/__arena/state");
    const active: string[] = r.body?.uiFlags ?? [];
    return {
      present: flags.every((f) => active.includes(f)),
      evidence: `uiFlags: ${active.join(", ") || "none"}`,
    };
  };
