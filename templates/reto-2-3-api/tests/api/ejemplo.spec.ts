import { expect, test } from "@playwright/test";
import { z } from "zod";

// Ejemplo del módulo 2.3: una petición GET y la validación del cuerpo con un esquema de Zod.
// Cuando tengas tus propios esquemas, guárdalos en `schemas/` y bórralo o ampíalo.
const listaDeProductos = z.object({
  items: z.array(
    z.object({ id: z.number().int(), name: z.string(), priceCents: z.number().int() }),
  ),
  total: z.number().int(),
});

test.describe("ejemplo", () => {
  test("el catálogo responde con la forma esperada", async ({ request }) => {
    const res = await request.get("/api/products?page=1&pageSize=5");
    expect(res.status()).toBe(200);
    const cuerpo = listaDeProductos.parse(await res.json());
    expect(cuerpo.items).toHaveLength(5);
  });
});
