import type { Confirmer } from "@course/scenario-engine";
import evalEsquema from "../../apps/qa-arena/scenarios/eval-2-3-esquema/confirm.ts";
import evalEstado from "../../apps/qa-arena/scenarios/eval-2-3-estado/confirm.ts";
import evalLimite from "../../apps/qa-arena/scenarios/eval-2-3-limite/confirm.ts";
import evalPaginacion from "../../apps/qa-arena/scenarios/eval-2-3-paginacion/confirm.ts";
import evalSesion from "../../apps/qa-arena/scenarios/eval-2-3-sesion/confirm.ts";
import evalCupon29 from "../../apps/qa-arena/scenarios/eval-2-9-cupon/confirm.ts";
import evalLoginError29 from "../../apps/qa-arena/scenarios/eval-2-9-login-error/confirm.ts";
import evalQuitar29 from "../../apps/qa-arena/scenarios/eval-2-9-quitar/confirm.ts";
import fase1Aserciones from "../../apps/qa-arena/scenarios/fase1-aserciones/confirm.ts";
import fase1Login from "../../apps/qa-arena/scenarios/fase1-login/confirm.ts";
import fase2Api from "../../apps/qa-arena/scenarios/fase2-api/confirm.ts";
import fase2Despliegue from "../../apps/qa-arena/scenarios/fase2-despliegue/confirm.ts";
import fase2E2eCombinado from "../../apps/qa-arena/scenarios/fase2-e2e-combinado/confirm.ts";

/**
 * Confirmers the evaluator runs before judging a suite (design §6.5). One line per scenario
 * used by a challenge in `retos/`; `run.test.ts` fails if a challenge needs one that is missing. They are bundled into the published evaluator by `scripts/build.ts`.
 */
export const confirmers: Readonly<Record<string, Confirmer>> = {
  "fase1-login": fase1Login,
  "fase1-aserciones": fase1Aserciones,
  "fase2-api": fase2Api,
  "eval-2-3-esquema": evalEsquema,
  "eval-2-3-estado": evalEstado,
  "eval-2-3-sesion": evalSesion,
  "eval-2-3-paginacion": evalPaginacion,
  "eval-2-3-limite": evalLimite,
  "eval-2-9-cupon": evalCupon29,
  "eval-2-9-quitar": evalQuitar29,
  "eval-2-9-login-error": evalLoginError29,
  "fase2-despliegue": fase2Despliegue,
  "fase2-e2e-combinado": fase2E2eCombinado,
};
