# Curso QA Automation con IA

Curso gratuito y abierto para QA manuales y funcionales que nunca programaron y quieren llegar a **QA Automation Senior** con enfoque en IA. 43 módulos en 6 fases (~44 semanas), con práctica real sobre una tienda en línea que tiene defectos sembrados a propósito.

> Estado: **en desarrollo**. Las fases 0, 1 y 2 están redactadas en borrador; las fases 3 a 5 están en diseño. Nada de esto está listo todavía para producción.

## Qué contiene

| Carpeta          | Qué es                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `content/`       | Lecciones en MDX, una por módulo (`fase-0` … `fase-5`), con ejercicios y cuestionarios        |
| `apps/platform/` | Plataforma de aprendizaje (Next.js + Supabase): roadmap, lecciones, progreso, retos           |
| `apps/qa-arena/` | **QA Arena**: tienda en línea para practicar, con un motor de escenarios que inyecta defectos |
| `packages/`      | Tipos compartidos y motor de escenarios                                                       |
| `evaluator/`     | Evaluador de retos (workflow reutilizable de GitHub Actions y reglas)                         |
| `templates/`     | Plantillas de retos que el alumno copia con _Use this template_                               |
| `docs/`          | Arquitectura, decisiones de diseño y revisiones                                               |
| `supabase/`      | Migraciones SQL y datos de ejemplo                                                            |

## Probarlo en tu máquina

Requisitos: Node 24 o superior, pnpm 10 y Docker con Compose v2.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```

Para levantar QA Arena con un solo comando, sigue [`apps/qa-arena/README.md`](apps/qa-arena/README.md). La lección [0.1](content/fase-0/0.1-entorno-y-terminal.mdx) explica el proceso paso a paso para quien empieza desde cero.

## Aviso sobre QA Arena

QA Arena contiene **defectos intencionales**, incluidos de seguridad, porque es material de práctica. No la despliegues junto a sistemas reales ni le pongas credenciales reales: debe vivir aislada, con su propia base de datos y sin secretos compartidos con otra aplicación. Las credenciales que aparecen en las lecciones son datos de práctica públicos.

## Contribuir

Lee [`CONTRIBUTING.md`](CONTRIBUTING.md). Para reportar una vulnerabilidad en la plataforma o el evaluador, usa el canal de [`SECURITY.md`](SECURITY.md) y no abras un issue público.

## Licencia

- **Código**: [MIT](LICENSE).
- **Lecciones y contenido** (`content/`): [CC BY-NC-SA 4.0](LICENSE-CONTENT.txt). Puedes compartirlas y adaptarlas con atribución, sin uso comercial y con la misma licencia.

El curso es gratuito. Si te sirvió y quieres aportar, hay un QR de aportes voluntarios dentro de la plataforma; no es necesario para usar nada de lo anterior.
