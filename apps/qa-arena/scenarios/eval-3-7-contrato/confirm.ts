import type { Confirmer } from "@course/scenario-engine";
import { checkFieldRenamed } from "./checks.ts";

const confirm: Confirmer = (c) => checkFieldRenamed(c);
export default confirm;
