# templates

Repositorios plantilla de retos que copia el alumno (incluyen tests evaluadores y workflow de GitHub Actions).

Cada subcarpeta `templates/<slug>/` es un reto. `generate-retos.ts --check` (CI) comprueba que `.course/challenge.json` y `evaluar.yml` nombran el `<slug>`, que los títulos de `reporte_titulos` aparecen literales en `tests/**/*.ts` y que cada `archivo` de un criterio `informe` existe como esqueleto.

Publicación: `pnpm --filter @course/evaluator exec tsx scripts/publish.ts template --slug <slug> --out <dir> --evaluator-sha <sha> [--api-digest … --web-digest …]` (los digests, si la plantilla lleva `arena/compose.yml`). Ver `docs/PUBLICAR_EVALUADOR.md`.

Retos con plantilla (6; cada `<slug>` es también el `exercise` de su `.course/challenge.json`):

| Slug                    | Lección | Lleva `arena/compose.yml` (exige digests) |
| ----------------------- | ------- | ----------------------------------------- |
| `reto-1-1-login`        | 1.1     | no                                        |
| `reto-2-2-pom`          | 2.2     | no                                        |
| `reto-2-3-api`          | 2.3     | no                                        |
| `reto-2-6-pipeline`     | 2.6     | sí                                        |
| `reto-2-8-docker`       | 2.8     | sí                                        |
| `reto-2-9-ia-framework` | 2.9     | no                                        |

`--slug` es opcional y vale `reto-1-1-login` por defecto. Para 2.6 y 2.8, `--api-digest` y `--web-digest` son obligatorios: los mismos digests que `publish.ts evaluator` escribe en `compose/arena.yml` (ver `docs/PUBLICAR_EVALUADOR.md`, paso 1). Los marcadores `__EVALUATOR_SHA__`, `__EVALUATOR_VERSION__`, `__API_DIGEST__` y `__WEB_DIGEST__` se quedan en `templates/`: `publish.ts template` los rellena solo en la copia de `--out`.
