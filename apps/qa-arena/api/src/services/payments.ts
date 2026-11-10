export interface CardInput {
  cardNumber: string;
  expMonth: number;
  expYear: number;
  cvc: string;
}

export type PaymentResult =
  { approved: true; last4: string } | { approved: false; last4: string; reason: string };

/** Simulated gateway. No real money, no card data stored beyond the last 4 digits. */
export function simulatePayment(card: CardInput, now = new Date()): PaymentResult {
  const digits = card.cardNumber.replace(/[\s-]/g, "");
  const last4 = digits.slice(-4).padStart(4, "0");
  if (!/^\d{13,19}$/.test(digits)) return { approved: false, last4, reason: "invalid_card" };
  const expired =
    card.expYear < now.getUTCFullYear() ||
    (card.expYear === now.getUTCFullYear() && card.expMonth < now.getUTCMonth() + 1);
  if (expired) return { approved: false, last4, reason: "card_expired" };
  if (!/^\d{3,4}$/.test(card.cvc)) return { approved: false, last4, reason: "invalid_card" };
  if (digits === "4242424242424242") return { approved: true, last4 };
  if (digits === "4000000000000002") return { approved: false, last4, reason: "card_declined" };
  if (digits === "4000000000009995")
    return { approved: false, last4, reason: "insufficient_funds" };
  return { approved: false, last4, reason: "invalid_card" };
}
