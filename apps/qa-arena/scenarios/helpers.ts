import type { ArenaClient } from "@course/scenario-engine";

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
