import type { Confirmer } from "@course/scenario-engine";
import { checkWrongStatus } from "../fase2-api/checks.ts";

const confirm: Confirmer = (c) => checkWrongStatus(c);
export default confirm;
