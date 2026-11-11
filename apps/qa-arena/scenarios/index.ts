import { createRegistry } from "@course/scenario-engine";
import { defects } from "./defects.ts";
import baseline from "./baseline/scenario.ts";
import fase0Entorno from "./fase0-entorno/scenario.ts";
import fase0Red from "./fase0-red/scenario.ts";
import fase1Login from "./fase1-login/scenario.ts";
import fase1Localizadores from "./fase1-localizadores/scenario.ts";
import fase1Compra from "./fase1-compra/scenario.ts";
import fase1Aserciones from "./fase1-aserciones/scenario.ts";
import fase1Ambientes from "./fase1-ambientes/scenario.ts";
import fase1FallosSembrados from "./fase1-fallos-sembrados/scenario.ts";
import fase1IaCopiloto from "./fase1-ia-copiloto/scenario.ts";
import fase2E2eCombinado from "./fase2-e2e-combinado/scenario.ts";
import fase2Api from "./fase2-api/scenario.ts";
import eval23Esquema from "./eval-2-3-esquema/scenario.ts";
import eval23Estado from "./eval-2-3-estado/scenario.ts";
import eval23Sesion from "./eval-2-3-sesion/scenario.ts";
import eval23Paginacion from "./eval-2-3-paginacion/scenario.ts";
import eval23Limite from "./eval-2-3-limite/scenario.ts";
import eval29Cupon from "./eval-2-9-cupon/scenario.ts";
import eval29LoginError from "./eval-2-9-login-error/scenario.ts";
import eval29Quitar from "./eval-2-9-quitar/scenario.ts";
import fase2Despliegue from "./fase2-despliegue/scenario.ts";
import fase2BaseDeDatos from "./fase2-base-de-datos/scenario.ts";
import fase3Flakiness from "./fase3-flakiness/scenario.ts";
import fase3ServicioCaido from "./fase3-servicio-caido/scenario.ts";
import fase3Seguridad from "./fase3-seguridad/scenario.ts";
import fase3Visual from "./fase3-visual/scenario.ts";
import fase3Accesibilidad from "./fase3-accesibilidad/scenario.ts";
import fase3Rendimiento from "./fase3-rendimiento/scenario.ts";
import eval31Carrera from "./eval-3-1-carrera/scenario.ts";
import eval31Intermitente from "./eval-3-1-intermitente/scenario.ts";
import eval32Paralelo from "./eval-3-2-paralelo/scenario.ts";
import eval37Contrato from "./eval-3-7-contrato/scenario.ts";

export { defects, type DefectId } from "./defects.ts";
export { defineScenario } from "./define.ts";
export { fetchClient } from "./fetch-client.ts";

/** One line per scenario, alphabetical. `baseline` always exists and has no defects. */
export const scenarios = [
  baseline,
  fase0Entorno,
  fase0Red,
  fase1Login,
  fase1Localizadores,
  fase1Compra,
  fase1Aserciones,
  fase1Ambientes,
  fase1FallosSembrados,
  fase1IaCopiloto,
  fase2E2eCombinado,
  fase2Api,
  eval23Esquema,
  eval23Estado,
  eval23Sesion,
  eval23Paginacion,
  eval23Limite,
  eval29Cupon,
  eval29Quitar,
  eval29LoginError,
  fase2Despliegue,
  fase2BaseDeDatos,
  fase3Flakiness,
  fase3ServicioCaido,
  fase3Seguridad,
  fase3Visual,
  fase3Accesibilidad,
  fase3Rendimiento,
  eval31Carrera,
  eval31Intermitente,
  eval32Paralelo,
  eval37Contrato,
].sort((a, b) => a.id.localeCompare(b.id));

/**
 * Injection points that sit on an HTTP route: the only ones where the fault plugin can apply a
 * latency or an error. A `latency` fault anywhere else would be silently ignored (review H24).
 */
export const ROUTE_POINTS = ["auth.login", "catalog.list", "checkout.submit"] as const;

export const registry = createRegistry(defects, scenarios, { routePoints: ROUTE_POINTS });
