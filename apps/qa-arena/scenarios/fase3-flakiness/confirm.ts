import type { Confirmer } from "@course/scenario-engine";
import { checkFlakyCheckout } from "./checks.ts";

/**
 * Only the 503 is confirmed here. The race is NOT: with it active the 503 can land on one of the
 * purchases and hide the oversell, and PGlite (this harness) runs transactions one after another,
 * so it cannot show up. `ui.late_loading` lives in the web layer. See README.md.
 */
const confirm: Confirmer = async (c) => checkFlakyCheckout(c);
export default confirm;
