# fase1-ia-copiloto

Módulo 1.8: IA como copiloto.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Un test generado por IA que solo cubre el camino feliz no detecta este defecto.

**Defectos / configuración.**

- `coupon.expired_accepted`

**Cómo reproducirlo.** La validación del cupón no comprueba el vencimiento: `EXPIRED20` se acepta.

**Cómo se confirma.** Aplica `EXPIRED20`: debe aceptarse (en `baseline`, 422). El arnés `api/test/scenarios.test.ts` lo ejecuta con el escenario activo y con `baseline`.
