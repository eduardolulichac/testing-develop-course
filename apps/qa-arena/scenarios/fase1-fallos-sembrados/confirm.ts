import type { Confirmer } from "@course/scenario-engine";
import { loginAna } from "../helpers.ts";

const confirm: Confirmer = async (c) => {
  const token = await loginAna(c);
  const body = {
    payment: { cardNumber: "4242424242424242", expMonth: 12, expYear: 2099, cvc: "123" },
    shippingAddress: "Av. Siempre Viva 123",
  };
  let failures = 0;
  for (let i = 0; i < 10; i++) {
    const r = await c.request("POST", "/api/checkout", { token, body });
    if (r.status === 503) failures++;
  }
  return { present: failures === 1, evidence: `${failures} x 503 in 10 checkout calls` };
};
export default confirm;
