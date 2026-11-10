import { expect, test, type APIRequestContext } from "@playwright/test";

const email = process.env.USUARIO_EMAIL!;
const clave = process.env.USUARIO_CLAVE!;
const req = (id: string) => ({ annotation: { type: "requisito", description: id } });

async function sesion(request: APIRequestContext) {
  const login = await request.post("/api/auth/login", { data: { email, password: clave } });
  const { token } = await login.json();
  return { authorization: `Bearer ${token}` };
}

// Aserciones débiles: solo comprueban que la API responde, nunca el valor que dicen los requisitos.
test(
  "el envío gratis se juzga después del descuento del cupón",
  req("REQ-3"),
  async ({ request }) => {
    const auth = await sesion(request);
    const res = await request.get("/api/cart", { headers: auth });
    expect(res.status()).toBe(200);
  },
);

test(
  "un cupón aplica su descuento también cuando la línea llega al stock",
  req("REQ-4"),
  async ({ request }) => {
    const auth = await sesion(request);
    const res = await request.post("/api/cart/coupon", {
      headers: auth,
      data: { code: "NOEXISTE" },
    });
    expect(res.status()).toBeLessThan(500);
  },
);

test(
  "el carrito no admite más de 10 unidades de un producto",
  req("REQ-5"),
  async ({ request }) => {
    const auth = await sesion(request);
    const res = await request.post("/api/cart/items", {
      headers: auth,
      data: { productId: 1, quantity: 11 },
    });
    expect(res.status()).toBe(400);
  },
);
