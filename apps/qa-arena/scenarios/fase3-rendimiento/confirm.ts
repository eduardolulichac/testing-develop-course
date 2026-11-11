import type { Confirmer } from "@course/scenario-engine";
import { checkSlowCatalog } from "./checks.ts";

const confirm: Confirmer = async (c) => checkSlowCatalog(c);
export default confirm;
