import type { Confirmer } from "@course/scenario-engine";
import { checkQuantityLimit } from "../fase2-api/checks.ts";

const confirm: Confirmer = (c) => checkQuantityLimit(c);
export default confirm;
