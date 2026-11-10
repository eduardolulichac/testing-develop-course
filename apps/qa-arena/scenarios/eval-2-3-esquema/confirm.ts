import type { Confirmer } from "@course/scenario-engine";
import { checkContractDrift } from "../fase2-api/checks.ts";

const confirm: Confirmer = (c) => checkContractDrift(c);
export default confirm;
