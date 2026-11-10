# supabase

Migraciones SQL, seed, plantillas de correo y configuración local de Supabase (CLI 3.0.0, Postgres 17).

## Puertos locales

Cambiados respecto a los de la CLI (543xx) para no chocar con otros proyectos de Supabase en la misma máquina:

| Servicio                         | Puerto |
| -------------------------------- | ------ |
| API (`NEXT_PUBLIC_SUPABASE_URL`) | 55321  |
| Postgres                         | 55322  |
| Studio                           | 55323  |
| Mailpit (correos locales)        | 55324  |

## Comandos (desde `apps/platform`)

```bash
pnpm db:start    # levanta Supabase local y aplica migraciones + seed
pnpm db:status   # muestra URL y claves locales (publishable/secret)
pnpm db:reset    # recrea la base desde migraciones + seed.sql
pnpm test:db     # tests de RLS contra la base local
pnpm db:stop
```

## Esquema

`migrations/20261105000000_initial_schema.sql` crea las 14 tablas de `docs/ARQUITECTURA.md` §4 con RLS activado en todas:

- **Contenido** (`phases`, `modules`, `lessons`, `exercises`): solo lectura para `authenticated`.
- **Propias del alumno** (`profiles`, `progress`, `ai_logs`, `feedback`): leer y escribir sus filas. `profiles` se crea con un trigger sobre `auth.users`; el alumno solo puede actualizar `nombre`, `experiencia_previa`, `objetivo` y `onboarding_completed_at` (permisos por columna): `nivel_actual` no es editable.
- **Propias de solo lectura** (`submissions`, `quiz_attempts`, `competency_scores`, `enrollments`, `challenge_links`): solo `select` de sus filas; escribe el servidor con la service role.
- **Internas** (`webhook_nonces`): sin permisos ni políticas; clave primaria `(key_id, nonce)`.
- `anon` no tiene acceso a ninguna tabla.

## Auth local

- Confirmación de correo activada. Los correos llegan a Mailpit (http://127.0.0.1:55324) y enlazan a `/auth/confirm` con `token_hash` (plantillas en `templates/`).
- Google OAuth activado con credenciales por variables de entorno: copia `.env.example` a `supabase/.env` y complétalo. Sin credenciales, el botón de Google falla pero el resto funciona.
