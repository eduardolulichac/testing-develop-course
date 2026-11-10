import type { Confirmer } from "@course/scenario-engine";

const confirm: Confirmer = async (c) => {
  const r = await c.request("GET", "/__arena/state");
  const flags: string[] = r.body.uiFlags ?? [];
  const present = ["ui.testid_rotating", "ui.ambiguous_labels"].every((f) => flags.includes(f));
  return { present, evidence: `uiFlags: ${flags.join(", ") || "none"}` };
};
export default confirm;
