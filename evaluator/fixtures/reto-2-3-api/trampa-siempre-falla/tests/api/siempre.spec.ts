import { expect, test } from "@playwright/test";

// A suite that always fails: it cannot be trusted in baseline.
for (let n = 1; n <= 22; n++) {
  test(`caso ${n}`, async ({ request }) => {
    const res = await request.get("/api/products");
    expect(res.status()).toBe(418);
  });
}
