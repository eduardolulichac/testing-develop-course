import type { Confirmer } from "@course/scenario-engine";
import { checkSlowCatalog } from "../fase3-rendimiento/checks.ts";

const confirm: Confirmer = (c) => checkSlowCatalog(c);
export default confirm;
