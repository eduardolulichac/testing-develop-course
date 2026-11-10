import type { Confirmer } from "@course/scenario-engine";
import {
  checkContractDrift,
  checkLogoutKeepsToken,
  checkPaginationOverlap,
  checkWrongStatus,
} from "./checks.ts";

/** Present only if the four defects are visible (review H25). */
const confirm: Confirmer = async (c) => {
  const results = [
    await checkPaginationOverlap(c),
    await checkWrongStatus(c),
    await checkLogoutKeepsToken(c),
    await checkContractDrift(c),
  ];
  return {
    present: results.every((r) => r.present),
    evidence: results.map((r) => r.evidence).join("; "),
  };
};
export default confirm;
