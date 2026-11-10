import type { Confirmer } from "@course/scenario-engine";
import fase1Aserciones from "../fase1-aserciones/confirm.ts";

const confirm: Confirmer = (c) => fase1Aserciones(c);
export default confirm;
