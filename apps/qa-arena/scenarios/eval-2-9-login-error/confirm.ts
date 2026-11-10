import type { Confirmer } from "@course/scenario-engine";

const confirm: Confirmer = async (c) => {
  const r = await c.request("GET", "/__arena/state");
  const flags: string[] = r.body.uiFlags ?? [];
  return {
    present: flags.includes("ui.typo_messages"),
    evidence: `uiFlags: ${flags.join(", ") || "none"}`,
  };
};
export default confirm;
