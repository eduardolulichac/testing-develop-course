import type { Confirmer } from "@course/scenario-engine";
import { addToCart, loginAna } from "../helpers.ts";

const confirm: Confirmer = async (c) => {
  const token = await loginAna(c);
  await addToCart(c, token, 1);
  const r = await c.request("POST", "/api/checkout", {
    token,
    body: {
      payment: { cardNumber: "4242424242424242", expMonth: 12, expYear: 2099, cvc: "123" },
      shippingAddress: "Av. Siempre Viva 123",
    },
  });
  const present = r.status === 500 && r.body?.error?.code === "internal_error";
  return {
    present,
    evidence: `valid checkout -> ${r.status} ${JSON.stringify(r.body?.error ?? {})}`,
  };
};
export default confirm;
