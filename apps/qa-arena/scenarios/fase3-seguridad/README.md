# fase3-seguridad

Módulo 3.6: Seguridad para QA (enfoque defensivo).

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Verificar **autorización y sesiones** desde la API: que un usuario solo accede a lo suyo, que un rol sin permiso recibe 403 y que una sesión caducada deja de valer. Es el enfoque de un QA que prueba controles, no el de un atacante: no hay cargas de ataque, ni inyección SQL, ni nada que se parezca a una explotación.

**Defectos / configuración.** Los tres se ven solo con el código de estado de una petición normal y bien formada.

- `security.idor_orders`: `GET /api/orders/:id` no comprueba que el pedido sea de quien lo pide. Con el defecto, Luis lee el pedido #1 (de Ana) con un 200; sin él, 404.
- `security.admin_no_role`: cualquier cliente autenticado pasa el control de los endpoints `/api/admin/*`. Con el defecto, Ana lista todos los pedidos con un 200; sin él, 403.
- `security.token_never_expires`: se ignora la fecha de expiración del token. El seed trae una sesión de «un dispositivo antiguo» de Luis, caducada desde 2026-01-01 (`SEED_EXPIRED_TOKEN` en `api/src/db/seed.ts`, valor `luis-old-device-expired-token-0001`). Con el defecto, un `GET /api/orders` con ese token da 200; sin él, 401.
- Semilla 3601. Datos por sesión: los pedidos y usuarios son del esquema de la sesión, así que el escenario es seguro también en la Arena alojada (`hosted: true`).

**Por qué no está `security.sql_injection_search`.** Es un defecto `runnerOnly` y volvería `hosted: false` a todo el escenario: la lección no podría activarlo en la Arena local (revisión C1). Sigue en el catálogo, dormido. Si hiciera falta, iría en un `eval-3-6-*` aparte y con una entrada benigna, por la política de contenido defensivo de 3.6.

**Cómo reproducirlo.** `GET /api/orders/1` con el token de Luis; `GET /api/admin/orders` con el token de Ana; `GET /api/orders` con `Authorization: Bearer luis-old-device-expired-token-0001`.

**Cómo se confirma.** `confirm.ts` exige ver los tres a la vez (en `baseline`: 404, 403 y 401). El token caducado está copiado en `confirm.ts` porque el paquete de escenarios no puede importar de la API; si los valores se separan, el arnés diferencial falla.

**Notas para la lección.** Pedir al alumno el informe «qué esperaba (404/403/401), qué obtuvo y qué riesgo supone», no que explote nada. Las cargas de ataque y la inyección quedan fuera.
