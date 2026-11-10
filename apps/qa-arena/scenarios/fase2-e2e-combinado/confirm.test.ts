import { describe, expect, it } from "vitest";
import { SEED_COUPONS, seedProducts } from "../../api/src/db/seed.ts";
import { PRICE_CENTS, PRODUCT, STOCK } from "./confirm.ts";

describe("fase2-e2e-combinado confirmer constants", () => {
  const p = seedProducts().find((x) => x.id === PRODUCT)!;
  const welcome = SEED_COUPONS.find((x) => x.code === "WELCOME10")!;

  it("match seedProducts()", () => {
    expect(p.priceCents).toBe(PRICE_CENTS);
    expect(p.stock).toBe(STOCK);
  });

  it("make the two combined defects observable", () => {
    const discount = Math.floor((PRICE_CENTS * welcome.value) / 100);
    expect(discount).toBe(509);
    // Before the discount the order qualifies for free shipping, after it does not.
    expect(PRICE_CENTS).toBeGreaterThanOrEqual(5000);
    expect(PRICE_CENTS - discount).toBeLessThan(5000);
    expect(Math.floor((PRICE_CENTS * STOCK * welcome.value) / 100)).toBe(3054);
  });
});
