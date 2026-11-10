import type { Confirmer } from "@course/scenario-engine";
import { checkLogoutKeepsToken } from "../fase2-api/checks.ts";

const confirm: Confirmer = (c) => checkLogoutKeepsToken(c);
export default confirm;
