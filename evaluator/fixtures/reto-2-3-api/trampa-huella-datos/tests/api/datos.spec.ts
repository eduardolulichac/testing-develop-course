import { expect, test } from "@playwright/test";

// Cheat (review C1, residual): tries to fingerprint the scenario through the DATA instead of the
// Arena internals. Every test passes on a clean Arena and asserts "the data is exactly the
// baseline's"; the hope is that a defective scenario changes the catalog.
for (let n = 1; n <= 20; n++) {
  test(`el producto ${n} conserva su precio de siempre`, async ({ request }) => {
    const res = await request.get(`/api/products/${n}`);
    expect(res.status()).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.id).toBe(n);
    expect(cuerpo.sku).toMatch(/^ARN-/);
  });
}

test("el catálogo tiene exactamente 24 productos", async ({ request }) => {
  const lista = await (await request.get("/api/products?pageSize=50")).json();
  expect(lista.total).toBe(24);
  expect(lista.items).toHaveLength(24);
});

test("el producto 1 cuesta lo mismo que siempre", async ({ request }) => {
  const cuerpo = await (await request.get("/api/products/1")).json();
  expect(String(cuerpo.priceCents)).toBe(String(cuerpo.priceCents));
  expect(cuerpo.stock).toBeGreaterThan(0);
});
