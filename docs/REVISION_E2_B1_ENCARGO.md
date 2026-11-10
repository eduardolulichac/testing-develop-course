# Encargo: revisión Opus de cierre de E2-B1 (motor de escenarios)

Para una sesión nueva con **Opus** (regla de `PLAN_DESARROLLO.md` §4: revisión final de cada etapa). Léelo junto con `PROGRESS.md`, `PLAN_DESARROLLO.md` y `docs/REVISION_E1.md` (formato del informe y hallazgos H6, H7 y H8 que esta etapa debía cerrar).

## Entregable

`docs/REVISION_E2_B1.md`, con el mismo formato que `docs/REVISION_E1.md`: veredicto (cerrar / cerrar con condiciones / no cerrar), hallazgos con severidad y tarea destino, y qué se verificó realmente. Si el veredicto lo permite, marcar E2-B1 como `DONE` en el tablero de `PROGRESS.md` y actualizar "Siguiente paso EXACTO". No reescribas el diseño: si algo falla, registra el hallazgo.

## Alcance

- Diseño de referencia: `docs/scenario-engine-design.md` (plan T1–T12 en §7, riesgos y decisiones por defecto en §8).
- Código: `packages/scenario-engine/`, `apps/qa-arena/scenarios/`, `apps/qa-arena/api/` (`src/engine.ts`, `src/context.ts`, `src/plugins/faults.ts`, `src/routes/arena.ts`, `src/db/sessions.ts`, `src/db/seed-dirty.ts`, `src/services/*`, `src/routes/*`), `apps/qa-arena/web/src/scenario/` y `web/src/test/ui-flags/`, `apps/qa-arena/docker-compose.yml`, `apps/qa-arena/api/Dockerfile`.
- Commits: desde `a7bf596` hasta `ec6a7b1` (`git log --oneline 5b62699..HEAD`).

## Qué comprobar (en este orden)

1. **Cierre de H6, H7 y H8.**
   - H6 (sesiones): creación perezosa, cuota por IP sin expulsar a otras IPs, `503 arena_full`, cookie firmada, `X-Arena-Session` ignorada en `hosted`, límite de peticiones. ¿Hay carreras entre `ensureSession`, `resetSession` y `setScenario` (locks de asesoría)? ¿Un visitante puede agotar el cupo de otro?
   - H7 (rol): ¿`runnerOnly` es **inalcanzable** en `hosted` y `local` por todas las vías? Revisa `PUT /__arena/scenario`, `ARENA_DEFAULT_SCENARIO`, `engineFor`/`createEngine` y una fila de sesión que apunte a un escenario `runnerOnly` tras un cambio de configuración (¿500 permanente o caída a baseline?). Confirma que el rol `arena_app` se usa de verdad (Docker) y que la comprobación `rolsuper` aborta.
   - H8 (cobertura): cada caso del Anexo B (1–6) y cada nivel de §5.2 del diseño tiene defecto/escenario, o queda registrado como planificado (`apps/qa-arena/scenarios/planned.ts`). Los casos 2 y 6 dependen de escenarios de la fase 2 que aún no existen.
2. **Determinismo y reproducibilidad.** «1 de cada N» (exactamente una por ventana), semilla fija por escenario, contadores por sesión que se reinician con `reset`/cambio de escenario. Revisa el contador de fallos de ruta (transacción propia) frente a `ctx.tick` (misma transacción, se deshace con el rollback): ¿es coherente para cada defecto del catálogo según dónde viva su punto de inyección?
3. **Fidelidad de los defectos.** Cada id de `scenarios/defects.ts` hace lo que dice su descripción y **solo** con el defecto activo (la baseline no cambia). Atención a: `payment.gateway_timeout_leaks_stock` (el 500 se envía tras el commit para que la fuga persista), `inventory.oversell_race` (solo se manifiesta con conexiones concurrentes reales; PGlite las serializa, así que el test solo comprueba la espera), `combo.coupon_shipping_stock` y `coupon.double_apply`.
4. **Spoilers y superficie.** `GET /__arena/state` no debe revelar defectos de backend (solo `uiFlags`); `GET /__arena/requirements` nunca devuelve `answerKey`; los mensajes de error inyectados no delatan el id del defecto. Los README de escenarios sí contienen spoilers (son para el autor): confirma que no se sirven.
5. **Calidad de los confirmadores y del arnés.** `api/test/scenarios.test.ts` exige presente en el escenario y ausente en baseline; revisa que cada `confirm.ts` pruebe de verdad el defecto principal y no un efecto colateral, y que `fase0-entorno` (`smoke`) sea la única excepción.
6. **Front.** `ScenarioProvider` (`?escenario` validado, banner de confirmación, remonte con `key={epoch}`, token borrado solo al cambiar de escenario), `ScenarioBar`, `ui-flags.tsx`. El contador del carrito y el deshabilitado de «Aplicar cupón» son cambios al baseline: ¿rompen algún contrato del dominio o de los E2E de la plataforma?
7. **Despliegue.** `docker compose up --build` limpio (`down -v` antes), `api/Dockerfile` carga `dist` de `@course/scenario-engine` y `@arena/scenarios`, smoke OK, `docs/ARQUITECTURA.md` §5.1 coincide con `src/config.ts`.

## Cómo verificar (no te fíes de este documento)

```bash
git status --short && git log --oneline -20
pnpm install --frozen-lockfile        # puede tardar ~2 min; lanzarlo en segundo plano
pnpm lint && pnpm format:check && pnpm typecheck
pnpm --filter @course/scenario-engine test
pnpm --filter @arena/scenarios test
pnpm --filter @arena/api test          # 92 tests esperados
pnpm --filter @arena/web test          # 25 tests esperados
pnpm validate:content                  # 12 avisos esperados (fases 2–5)
cd apps/qa-arena && docker compose down -v && docker compose up --build -d
ARENA_URL=http://localhost:18080 pnpm --filter @arena/api smoke
```

Repite por tu cuenta al menos: una prueba de carrera sobre `ensureSession` con dos IPs, `PUT /__arena/scenario` con un escenario `runnerOnly` en `hosted` y `local`, y el reinicio del contador de fallos. Si abres el navegador real contra Docker, que sea con la herramienta de Chrome y registra qué viste.

## Lo que el autor ya sabe que no está verificado

- Solo en jsdom (nunca en Chrome real): `ui.state_mismatch`, `ui.double_submit`, `ui.typo_messages`, `ui.a11y_violations` (con `axe-core` solo la regla `label`), `ui.visual_regression`, y la página «Requisitos» (ningún escenario de las fases 0–1 tiene `requirements`).
- El aviso de «Esto reinicia tus datos de práctica» sale siempre que el escenario actual no sea baseline (el diseño pedía además «con pedidos»; sin sesión iniciada el front no puede saberlo).
- `ui.late_loading` usa 1500–3000 ms fijos en el front porque la API no expone los `params` del defecto.
- El modo `per-visitor` solo se probó con PGlite, no en Docker; el límite de peticiones solo se registra en `hosted`.
- Los defectos de las fases 2–5 (escenarios `fase2-*` a `fase5-*`) no están implementados como escenarios; solo existe el catálogo.
- Decisión a validar: `runnerOnly` solo con `ARENA_DEPLOYMENT=ephemeral` (también excluye `local`).
