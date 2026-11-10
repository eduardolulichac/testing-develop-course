import { expect, test, type APIRequestContext } from "@playwright/test";

const email = process.env.USUARIO_EMAIL!;
const clave = process.env.USUARIO_CLAVE!;
const req = (id: string) => ({ annotation: { type: "requisito", description: id } });

// Producto 15: 5090 centavos y stock 6. WELCOME10 descuenta el 10 %.
async function sesionConCarritoVacio(request: APIRequestContext) {
  const login = await request.post("/api/auth/login", { data: { email, password: clave } });
  const { token } = await login.json();
  const auth = { authorization: `Bearer ${token}` };
  await request.delete("/api/cart/coupon", { headers: auth });
  await request.delete("/api/cart/items/15", { headers: auth });
  return auth;
}

test(
  "el envío gratis se juzga después del descuento del cupón",
  req("REQ-3"),
  async ({ request }) => {
    const auth = await sesionConCarritoVacio(request);
    await request.post("/api/cart/items", { headers: auth, data: { productId: 15, quantity: 1 } });
    const res = await request.post("/api/cart/coupon", {
      headers: auth,
      data: { code: "WELCOME10" },
    });
    const cart = await res.json();
    // 5090 - 509 = 4581 < 5000: el requisito pide cobrar el envío.
    expect(cart.shippingCents).toBe(500);
    await request.delete("/api/cart/coupon", { headers: auth });
    await request.delete("/api/cart/items/15", { headers: auth });
  },
);

test(
  "un cupón aplica su descuento también cuando la línea llega al stock",
  req("REQ-4"),
  async ({ request }) => {
    const auth = await sesionConCarritoVacio(request);
    await request.post("/api/cart/items", { headers: auth, data: { productId: 15, quantity: 6 } });
    const res = await request.post("/api/cart/coupon", {
      headers: auth,
      data: { code: "WELCOME10" },
    });
    const cart = await res.json();
    expect(cart.discountCents).toBeGreaterThan(0);
    await request.delete("/api/cart/coupon", { headers: auth });
    await request.delete("/api/cart/items/15", { headers: auth });
  },
);

test(
  "el carrito no admite más de 10 unidades de un producto",
  req("REQ-5"),
  async ({ request }) => {
    const auth = await sesionConCarritoVacio(request);
    const res = await request.post("/api/cart/items", {
      headers: auth,
      data: { productId: 1, quantity: 11 },
    });
    expect(res.status()).toBe(400);
  },
);
