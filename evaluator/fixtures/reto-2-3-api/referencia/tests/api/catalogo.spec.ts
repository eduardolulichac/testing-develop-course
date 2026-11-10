import { expect, test } from "@playwright/test";
import { errorDeApi } from "../../schemas/usuario";
import { listaDeProductos, producto } from "../../schemas/producto";

test.describe("catálogo", () => {
  test("la lista cumple el esquema", async ({ request }) => {
    const res = await request.get("/api/products");
    expect(res.status()).toBe(200);
    const lista = listaDeProductos.parse(await res.json());
    expect(lista.items.length).toBeGreaterThan(0);
  });

  test("pageSize limita los elementos de la página", async ({ request }) => {
    const res = await request.get("/api/products?page=1&pageSize=5");
    const lista = listaDeProductos.parse(await res.json());
    expect(lista.items).toHaveLength(5);
    expect(lista.pageSize).toBe(5);
  });

  test("la página 2 no repite productos", async ({ request }) => {
    const uno = listaDeProductos.parse(
      await (await request.get("/api/products?page=1&pageSize=5")).json(),
    );
    const dos = listaDeProductos.parse(
      await (await request.get("/api/products?page=2&pageSize=5")).json(),
    );
    const ids1 = uno.items.map((p) => p.id);
    for (const p of dos.items) expect(ids1).not.toContain(p.id);
  });

  test("recorrer todas las páginas no repite ni pierde productos", async ({ request }) => {
    const vistos: number[] = [];
    let total = 0;
    for (let page = 1; page <= 20; page++) {
      const res = await request.get(`/api/products?page=${page}&pageSize=10&sort=price_asc`);
      const lista = listaDeProductos.parse(await res.json());
      total = lista.total;
      vistos.push(...lista.items.map((p) => p.id));
      if (vistos.length >= total) break;
    }
    expect(new Set(vistos).size).toBe(vistos.length);
    expect(vistos).toHaveLength(total);
  });

  test("el detalle de un producto cumple el esquema", async ({ request }) => {
    const res = await request.get("/api/products/1");
    expect(res.status()).toBe(200);
    const cuerpo = producto.parse(await res.json());
    expect(cuerpo.id).toBe(1);
  });

  test("el precio del detalle es un entero", async ({ request }) => {
    const cuerpo = await (await request.get("/api/products/2")).json();
    expect(typeof cuerpo.priceCents).toBe("number");
    expect(Number.isInteger(cuerpo.priceCents)).toBe(true);
  });

  test("un producto inexistente responde 404 con el error del contrato", async ({ request }) => {
    const res = await request.get("/api/products/99999");
    expect(res.status()).toBe(404);
    expect(errorDeApi.parse(await res.json()).error.code).toBe("not_found");
  });

  test("pageSize por encima del máximo responde 400", async ({ request }) => {
    const res = await request.get("/api/products?pageSize=51");
    expect(res.status()).toBe(400);
  });

  test("el filtro por categoría solo devuelve esa categoría", async ({ request }) => {
    const todo = listaDeProductos.parse(await (await request.get("/api/products")).json());
    const categoria = todo.categories[0]!;
    const res = await request.get(`/api/products?category=${encodeURIComponent(categoria)}`);
    const lista = listaDeProductos.parse(await res.json());
    expect(lista.items.length).toBeGreaterThan(0);
    for (const p of lista.items) expect(p.category).toBe(categoria);
  });

  test("ordenar por precio ascendente devuelve precios no decrecientes", async ({ request }) => {
    const res = await request.get("/api/products?sort=price_asc&pageSize=20");
    const precios = listaDeProductos.parse(await res.json()).items.map((p) => p.priceCents);
    expect(precios).toEqual([...precios].sort((a, b) => a - b));
  });
});
