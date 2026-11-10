import type { Confirmer } from "@course/scenario-engine";
import { addToCart, applyCoupon, loginAna } from "../helpers.ts";

const confirm: Confirmer = async (c) => {
  const token = await loginAna(c);
  await addToCart(c, token, 1);
  const r = await applyCoupon(c, token, "EXPIRED20");
  return { present: r.status === 200, evidence: `EXPIRED20 -> ${r.status}` };
};
export default confirm;
