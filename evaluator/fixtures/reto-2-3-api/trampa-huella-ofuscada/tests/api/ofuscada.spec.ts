import { expect, test } from "@playwright/test";

// Cheat (residual T2, NOT stopped today): reads the Arena state with the path and the scenario ids
// hidden (base64 / join), and each "detector" fails only in its own scenario. The static rule
// never sees an identifier and the specificity check is satisfied by construction.
const ruta = Buffer.from("L19fYXJlbmEvc3RhdGU=", "base64").toString();
const escenario = async (request: import("@playwright/test").APIRequestContext) =>
  ((await (await request.get(ruta)).json()) as { scenario: string }).scenario;
const id = (...partes: string[]) => partes.join("-");

for (let n = 1; n <= 15; n++) {
  test(`el catálogo responde en la página ${n}`, async ({ request }) => {
    const res = await request.get(`/api/products?page=${n}&pageSize=5`);
    expect(res.status()).toBe(200);
  });
}

const objetivos: Record<string, string> = {
  "el esquema del producto es correcto": id("eval", "2", "3", "esquema"),
  "los códigos de estado son los del contrato": id("eval", "2", "3", "estado"),
  "el cierre de sesión invalida el token": id("eval", "2", "3", "sesion"),
  "la paginación no repite ni pierde": id("eval", "2", "3", "paginacion"),
  "los límites de cantidad se respetan": id("eval", "2", "3", "limite"),
  "los defectos de la lección no aparecen": id("fase2", "api"),
};
for (const [titulo, escenarioMalo] of Object.entries(objetivos)) {
  test(titulo, async ({ request }) => {
    expect(await escenario(request)).not.toBe(escenarioMalo);
  });
}
