import type { Confirmer } from "@course/scenario-engine";
import { checkPaginationOverlap } from "../fase2-api/checks.ts";

const confirm: Confirmer = (c) => checkPaginationOverlap(c);
export default confirm;
