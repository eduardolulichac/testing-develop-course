import type { Confirmer } from "@course/scenario-engine";
import { addToCart, applyCoupon, loginAna } from "../helpers.ts";

const confirm: Confirmer = async (c) => {
  const token = await loginAna(c);
  await addToCart(c, token, 15);
  const r = await applyCoupon(c, token, "BIGSPEND");
  return {
    present: r.body.discountCents === 764,
    evidence: `BIGSPEND on 5090 -> ${r.body.discountCents}`,
  };
};
export default confirm;
