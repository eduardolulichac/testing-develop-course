# platform

Plataforma de aprendizaje: Next.js (App Router) + TypeScript + Tailwind, contenido MDX, auth y datos con Supabase.

## Versiones

Next.js 16.4.5 (Turbopack), React 19.3.1, Tailwind CSS 4.3.4, next-themes 0.4.6, `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.119.0, Supabase CLI 3.0.0, Zod 4.6.7, Vitest 5.1.0, Playwright 1.64.1.

## Puesta en marcha local

```bash
pnpm install                      # desde la raíz del repo
cd apps/platform
pnpm db:start                     # Supabase local (Docker) con migraciones y seed
cp .env.example .env.local        # completa con `pnpm db:status` (URL, publishable y secret key)
pnpm dev                          # http://localhost:3100
```

Los correos (confirmación, recuperación) llegan a Mailpit: http://127.0.0.1:55324.

## Comandos (desde `apps/platform`)

| Comando          | Qué hace                                                            |
| ---------------- | ------------------------------------------------------------------- |
| `pnpm dev`       | Servidor de desarrollo en http://localhost:3100                     |
| `pnpm build`     | Build de producción                                                 |
| `pnpm lint`      | ESLint (configuración raíz + `eslint-config-next`)                  |
| `pnpm typecheck` | Genera tipos de rutas y ejecuta `tsc --noEmit`                      |
| `pnpm test`      | Tests unitarios con Vitest (sin servicios externos)                 |
| `pnpm test:db`   | Tests de RLS contra la base local (requiere `pnpm db:start`)        |
| `pnpm test:e2e`  | Suite E2E de auth y perfil con Playwright (requiere Supabase local) |
| `pnpm db:*`      | `start`, `stop`, `reset`, `status` de Supabase local                |

La primera vez: `pnpm exec playwright install chromium`.

## Auth

- `proxy.ts` (en Next 16 reemplaza a `middleware.ts`) refresca la sesión con `getClaims()` y redirige a `/login?next=...` cualquier ruta no pública (`lib/routes.ts`). Los datos se protegen además con RLS.
- Server Actions en `lib/auth/actions.ts`: registro, inicio de sesión, Google OAuth, recuperación y cambio de clave, cierre de sesión. Validación con Zod.
- `/auth/confirm` verifica los enlaces de correo (`token_hash`), `/auth/callback` intercambia el código de OAuth, `/auth/error` muestra errores amables.
- El parámetro `next` se valida con `safeNextPath` para evitar redirecciones abiertas.
- Google OAuth necesita credenciales en `supabase/.env` (ver `supabase/.env.example`). El test E2E de Google se detiene en `/auth/v1/authorize` y no sale a internet.

## Estructura

- `app/`: rutas (App Router). Rutas visibles en español (`/roadmap`, `/perfil`, `/onboarding`, `/login`, `/registro`, `/recuperar-clave`, `/actualizar-clave`, `/lecciones/[slug]`).
- `components/`: cabecera, pie, tema claro/oscuro, formularios.
- `lib/`: clientes de Supabase, acciones de auth y perfil, esquemas Zod, rutas.
- `tests/db/`: tests de RLS. `e2e/`: tests de Playwright (fixtures en `e2e/support/`).

El tema sigue la preferencia del sistema y se puede cambiar con el botón de la cabecera (clase `.dark` en `<html>`, variables CSS en `app/globals.css`).
