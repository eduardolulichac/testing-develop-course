import type { Confirmer } from "@course/scenario-engine";
import { addToCart, applyCoupon, loginAna } from "../helpers.ts";

const confirm: Confirmer = async (c) => {
  const token = await loginAna(c);
  await addToCart(c, token, 1);
  const r = await applyCoupon(c, token, "QA15");
  return { present: r.status === 200, evidence: `QA15 -> ${r.status}` };
};
export default confirm;
