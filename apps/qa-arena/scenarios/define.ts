import { defineScenario as define, type TypedScenarioInput } from "@course/scenario-engine";
import type { DefectId } from "./defects.ts";

/** `defineScenario` bound to this catalog: referencing an unknown defect id fails typecheck. */
export const defineScenario = (input: TypedScenarioInput<DefectId>) => define<DefectId>(input);
