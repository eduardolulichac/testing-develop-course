import type { Confirmer } from "@course/scenario-engine";
import { checkFlakyCheckout } from "../fase3-flakiness/checks.ts";

const confirm: Confirmer = (c) => checkFlakyCheckout(c);
export default confirm;
