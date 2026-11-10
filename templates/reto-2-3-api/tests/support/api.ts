import type { APIRequestContext } from "@playwright/test";

/** Variables de entorno de práctica. En tu máquina vienen de `.env`; en el evaluador las pone él. */
export function credenciales(): { email: string; clave: string } {
  const email = process.env.USUARIO_EMAIL;
  const clave = process.env.USUARIO_CLAVE;
  if (!email || !clave) {
    throw new Error("Faltan USUARIO_EMAIL y USUARIO_CLAVE: copia .env.example como .env");
  }
  return { email, clave };
}

/** Inicia sesión por API con el usuario de práctica y devuelve el token. */
export async function loginPorApi(request: APIRequestContext): Promise<string> {
  const { email, clave } = credenciales();
  const res = await request.post("/api/auth/login", { data: { email, password: clave } });
  if (!res.ok()) throw new Error(`Login por API falló con ${res.status()}`);
  const cuerpo = (await res.json()) as { token: string };
  return cuerpo.token;
}

/** Cabecera de autenticación para las rutas protegidas. */
export const conToken = (token: string) => ({ Authorization: `Bearer ${token}` });
