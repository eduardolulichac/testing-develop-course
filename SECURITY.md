# Política de seguridad

## Qué es y qué no es una vulnerabilidad

**QA Arena (`apps/qa-arena/`) tiene defectos intencionales**, incluidos de seguridad: son el material del curso (módulo 3.6). Reportar uno de esos defectos **no** es una vulnerabilidad. Están documentados en los escenarios de `apps/qa-arena/scenarios/`.

Sí nos interesa saber de fallos en:

- La plataforma (`apps/platform/`): autenticación, políticas RLS de Supabase, acceso a datos de otros usuarios.
- El webhook de resultados de retos (`/api/webhooks/challenge-result`) y la firma HMAC.
- El evaluador (`evaluator/`) y sus workflows de GitHub Actions.
- Secretos o datos personales expuestos por error en el repositorio.

## Cómo reportar

**No abras un issue público.** Usa el reporte privado de GitHub: pestaña _Security_ del repositorio → _Report a vulnerability_.

Incluye qué encontraste, cómo reproducirlo y qué impacto tiene. Es un proyecto personal y gratuito: responderé cuando pueda, sin plazos garantizados.

## Versiones con soporte

Solo la rama `main`.
