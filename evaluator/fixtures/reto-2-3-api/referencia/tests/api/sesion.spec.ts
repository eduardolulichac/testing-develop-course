import { expect, test } from "@playwright/test";
import { errorDeApi, sesion, usuario } from "../../schemas/usuario";
import { conToken, credenciales, loginPorApi } from "../support/api";
import { usuarioNuevo } from "../support/datos";

test.describe("sesión", () => {
  test("el login correcto devuelve un token y el usuario", async ({ request }) => {
    const { email, clave } = credenciales();
    const res = await request.post("/api/auth/login", { data: { email, password: clave } });
    expect(res.status()).toBe(200);
    expect(sesion.parse(await res.json()).user.email).toBe(email);
  });

  test("una clave incorrecta responde 401", async ({ request }) => {
    const { email } = credenciales();
    const res = await request.post("/api/auth/login", {
      data: { email, password: "clave-equivocada" },
    });
    expect(res.status()).toBe(401);
    errorDeApi.parse(await res.json());
  });

  test("me sin token responde 401", async ({ request }) => {
    const res = await request.get("/api/auth/me");
    expect(res.status()).toBe(401);
  });

  test("me con token devuelve el usuario del esquema", async ({ request }) => {
    const token = await loginPorApi(request);
    const res = await request.get("/api/auth/me", { headers: conToken(token) });
    expect(res.status()).toBe(200);
    usuario.parse(await res.json());
  });

  test("el token deja de valer después de cerrar sesión", async ({ request }) => {
    const token = await usuarioNuevo(request);
    const salida = await request.post("/api/auth/logout", { headers: conToken(token) });
    expect(salida.status()).toBe(204);
    const res = await request.get("/api/auth/me", { headers: conToken(token) });
    expect(res.status()).toBe(401);
  });

  test("cerrar sesión sin token responde 401", async ({ request }) => {
    const res = await request.post("/api/auth/logout");
    expect(res.status()).toBe(401);
  });

  test("registrar un correo repetido responde 409", async ({ request }) => {
    const { email } = credenciales();
    const res = await request.post("/api/auth/register", {
      data: { email, password: "otra-clave-larga", name: "Repetida" },
    });
    expect(res.status()).toBe(409);
    expect(errorDeApi.parse(await res.json()).error.code).toBe("email_taken");
  });

  test("registrar con una clave corta responde 400", async ({ request }) => {
    const res = await request.post("/api/auth/register", {
      data: { email: `corta-${Date.now()}@arena.test`, password: "123", name: "Corta" },
    });
    expect(res.status()).toBe(400);
  });
});
