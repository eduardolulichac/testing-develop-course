import { expect, test } from "@playwright/test";
import { carrito } from "../../schemas/carrito";
import { errorDeApi } from "../../schemas/usuario";
import { conToken } from "../support/api";
import { usuarioNuevo } from "../support/datos";

test.describe("carrito", () => {
  test("añadir un producto crea la línea y cumple el esquema", async ({ request }) => {
    const token = await usuarioNuevo(request);
    const res = await request.post("/api/cart/items", {
      headers: conToken(token),
      data: { productId: 1, quantity: 2 },
    });
    expect(res.status()).toBe(200);
    const cuerpo = carrito.parse(await res.json());
    expect(cuerpo.items).toHaveLength(1);
    expect(cuerpo.items[0]!.quantity).toBe(2);
  });

  test("más unidades que el stock responde 409", async ({ request }) => {
    const token = await usuarioNuevo(request);
    const detalle = await (await request.get("/api/products/11")).json();
    const res = await request.post("/api/cart/items", {
      headers: conToken(token),
      data: { productId: 11, quantity: detalle.stock + 1 },
    });
    expect(res.status()).toBe(409);
    expect(errorDeApi.parse(await res.json()).error.code).toBe("insufficient_stock");
  });

  test("cantidad cero responde 400", async ({ request }) => {
    const token = await usuarioNuevo(request);
    const res = await request.post("/api/cart/items", {
      headers: conToken(token),
      data: { productId: 1, quantity: 0 },
    });
    expect(res.status()).toBe(400);
  });

  test("un producto inexistente responde 404", async ({ request }) => {
    const token = await usuarioNuevo(request);
    const res = await request.post("/api/cart/items", {
      headers: conToken(token),
      data: { productId: 99999, quantity: 1 },
    });
    expect(res.status()).toBe(404);
  });

  test("el carrito sin token responde 401", async ({ request }) => {
    const res = await request.get("/api/cart");
    expect(res.status()).toBe(401);
  });

  test("sumar unidades por encima del máximo por producto responde 422", async ({ request }) => {
    const token = await usuarioNuevo(request);
    const cabeceras = conToken(token);
    const primera = await request.post("/api/cart/items", {
      headers: cabeceras,
      data: { productId: 3, quantity: 6 },
    });
    expect(primera.status()).toBe(200);
    const segunda = await request.post("/api/cart/items", {
      headers: cabeceras,
      data: { productId: 3, quantity: 6 },
    });
    expect(segunda.status()).toBe(422);
    expect(errorDeApi.parse(await segunda.json()).error.code).toBe("quantity_limit");
  });

  test("quitar una línea deja el carrito vacío", async ({ request }) => {
    const token = await usuarioNuevo(request);
    const cabeceras = conToken(token);
    await request.post("/api/cart/items", { headers: cabeceras, data: { productId: 4 } });
    const res = await request.delete("/api/cart/items/4", { headers: cabeceras });
    expect(res.status()).toBe(200);
    expect(carrito.parse(await res.json()).items).toHaveLength(0);
  });

  test("el total es subtotal menos descuento más envío", async ({ request }) => {
    const token = await usuarioNuevo(request);
    const res = await request.post("/api/cart/items", {
      headers: conToken(token),
      data: { productId: 5, quantity: 2 },
    });
    const c = carrito.parse(await res.json());
    expect(c.totalCents).toBe(c.subtotalCents - c.discountCents + c.shippingCents);
  });

  test("un cupón inexistente responde 422", async ({ request }) => {
    const token = await usuarioNuevo(request);
    const res = await request.post("/api/cart/coupon", {
      headers: conToken(token),
      data: { code: "NOEXISTE" },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("el cupón WELCOME10 aplica el 10 % al subtotal", async ({ request }) => {
    const token = await usuarioNuevo(request);
    const cabeceras = conToken(token);
    await request.post("/api/cart/items", {
      headers: cabeceras,
      data: { productId: 5, quantity: 2 },
    });
    const res = await request.post("/api/cart/coupon", {
      headers: cabeceras,
      data: { code: "WELCOME10" },
    });
    const c = carrito.parse(await res.json());
    expect(c.discountCents).toBe(Math.round(c.subtotalCents * 0.1));
  });
});
