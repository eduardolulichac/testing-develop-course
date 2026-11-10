import type { Confirmer } from "@course/scenario-engine";
import { checkGatewayDownHandled } from "./checks.ts";

/**
 * Confirms the DEFAULT release (`v1.0.0`, gateway down: handled with a 402 and the cart kept). The
 * confirmer cannot change release, and `v2.0.0` waits 8 s of server time, so `v2.0.0` has its own test in
 * `api/test/scenarios.test.ts` (`checkTimeoutLeaksStock`, with an instant `sleep`).
 */
const confirm: Confirmer = async (c) => checkGatewayDownHandled(c);
export default confirm;
