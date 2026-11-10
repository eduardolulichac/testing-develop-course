# Cómo contribuir

Gracias por querer ayudar. Este es un curso en desarrollo, así que antes de escribir mucho código conviene abrir un issue y comentar la idea.

## Qué se agradece

- Correcciones de erratas, enlaces rotos y explicaciones confusas en `content/`.
- Errores en los fragmentos de código de las lecciones (todo fragmento debe correr tal como está escrito).
- Fallos reales de la plataforma, QA Arena o el evaluador, con pasos para reproducirlos.

Los defectos de QA Arena **son intencionales**: antes de reportar uno, revisa `apps/qa-arena/scenarios/`.

## Reglas rápidas

1. Idioma: contenido y comunicación en **español**; código, variables y mensajes de commit en **inglés**.
2. Commits convencionales: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `style:`.
3. Antes de abrir un PR: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` y `pnpm validate:content`.
4. TypeScript estricto, sin `any` salvo justificado en un comentario.
5. **Nada de secretos.** Solo `.env.example` con nombres de variables, nunca valores reales.
6. Un PR, un cambio. Si toca varias cosas, sepáralo.

## Licencia de las contribuciones

Al enviar un PR aceptas que tu aporte se publique bajo la licencia del área que toca: MIT para el código y CC BY-NC-SA 4.0 para `content/`.

## Las GitHub Actions de los PR de forks

Los PR de personas sin historial en el repo requieren aprobación manual para ejecutar los workflows. Puede tardar.
