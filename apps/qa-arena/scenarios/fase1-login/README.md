# fase1-login

Módulo 1.1: Primer test: login.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Un login que distingue mayúsculas en el correo y mensajes de error mal escritos.

**Defectos / configuración.**

- `auth.email_case_sensitive`
- `ui.typo_messages`

**Cómo reproducirlo.** `Ana@arena.test` no inicia sesión aunque la contraseña sea correcta; los errores de login y checkout tienen faltas de ortografía.

**Cómo se confirma.** Inicia sesión con el correo en otra capitalización: debe dar 401 (en `baseline`, 200). La parte de UI se prueba en `web/src/test/ui-flags`. El arnés `api/test/scenarios.test.ts` lo ejecuta con el escenario activo y con `baseline`.

**Notas de contenido (1.1).** Todo el front va sin tildes («Iniciar sesion», «Contrasena», «Catalogo»); no es un defecto del escenario. Con `ui.typo_messages` el error de login sale como «Ivnalid eamil or psasword».
