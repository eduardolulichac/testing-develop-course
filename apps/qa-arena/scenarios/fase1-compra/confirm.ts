import type { Confirmer } from "@course/scenario-engine";
import { addToCart, applyCoupon, loginAna } from "../helpers.ts";

const confirm: Confirmer = async (c) => {
  const token = await loginAna(c);
  await addToCart(c, token, 1, 5);
  const first = await applyCoupon(c, token, "SAVE5");
  const second = await applyCoupon(c, token, "SAVE5");
  const [a, b] = [first.body.discountCents, second.body.discountCents];
  return { present: b === a * 2, evidence: `discount after 1st ${a}, after 2nd ${b}` };
};
export default confirm;
