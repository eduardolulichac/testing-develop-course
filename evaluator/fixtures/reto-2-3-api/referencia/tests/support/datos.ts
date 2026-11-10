import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { sesion } from "../../schemas/usuario";

/** Crea un usuario nuevo para que cada prueba tenga su propio carrito (los datos se acumulan). */
export async function usuarioNuevo(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/auth/register", {
    data: { email: `qa-${randomUUID()}@arena.test`, password: randomUUID(), name: "Usuaria QA" },
  });
  return sesion.parse(await res.json()).token;
}
