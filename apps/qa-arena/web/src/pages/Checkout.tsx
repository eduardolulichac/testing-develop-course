import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import type { ReactNode } from "react";
import { api, ApiError, usd, type Cart, type Order } from "../api";
import { useMessages, useTestId, useUiFlag } from "../scenario/ui-flags";
import { ScenarioSlot } from "../scenario/ScenarioProvider";

interface Result {
  order: Order;
  paymentStatus: "approved" | "declined";
  reason: string | null;
}

const REASONS: Record<string, string> = {
  card_declined: "Tarjeta rechazada",
  insufficient_funds: "Fondos insuficientes",
  card_expired: "Tarjeta vencida",
  invalid_card: "Tarjeta invalida",
};

export function Checkout() {
  const navigate = useNavigate();
  const [cart, setCart] = useState<Cart | null>(null);
  const [address, setAddress] = useState("");
  const [card, setCard] = useState("4242 4242 4242 4242");
  const [month, setMonth] = useState("12");
  const [year, setYear] = useState("2030");
  const [cvc, setCvc] = useState("123");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Cart>("GET", "/api/cart")
      .then(setCart)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function pay(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<Result>("POST", "/api/checkout", {
        shippingAddress: address,
        payment: { cardNumber: card, expMonth: Number(month), expYear: Number(year), cvc },
      });
      if (r.paymentStatus === "approved") navigate(`/orders/${r.order.id}?paid=1`);
      else setError(`Pago rechazado: ${REASONS[r.reason ?? ""] ?? r.reason}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  const tid = useTestId();
  const msg = useMessages();
  const a11y = useUiFlag("ui.a11y_violations");

  if (!cart) return <p data-testid="checkout-loading">Cargando...</p>;
  if (cart.items.length === 0) {
    return (
      <p data-testid="checkout-empty">
        No hay productos para pagar. <Link to="/">Ir al catalogo</Link>
      </p>
    );
  }
  return (
    <section className="card narrow">
      {a11y && <TrapModal />}
      <h1>Pagar</h1>
      <p data-testid="checkout-total">
        Total a pagar:{" "}
        <strong className={a11y ? "low-contrast" : undefined}>{usd(cart.totalCents)}</strong>
      </p>
      <form onSubmit={pay} data-testid="checkout-form">
        <Field label="Direccion de envio">
          <input
            data-testid="checkout-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            minLength={5}
          />
        </Field>
        <Field label="Numero de tarjeta">
          <input
            data-testid="checkout-card"
            inputMode="numeric"
            value={card}
            onChange={(e) => setCard(e.target.value)}
            required
          />
        </Field>
        <div className="row">
          <Field label="Mes">
            <input
              data-testid="checkout-exp-month"
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              required
            />
          </Field>
          <Field label="Anio">
            <input
              data-testid="checkout-exp-year"
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              required
            />
          </Field>
          <Field label="CVC">
            <input
              data-testid="checkout-cvc"
              inputMode="numeric"
              value={cvc}
              onChange={(e) => setCvc(e.target.value)}
              required
            />
          </Field>
        </div>
        <p className="hint">
          Tarjetas de prueba: 4242 4242 4242 4242 (aprobada), 4000 0000 0000 0002 (rechazada), 4000
          0000 0000 9995 (sin fondos).
        </p>
        {error && (
          <p role="alert" className="error" data-testid="checkout-error">
            {msg(error)}
          </p>
        )}
        <ScenarioSlot name="checkout.pay-button">
          <button
            type="submit"
            className="primary"
            data-testid={tid("checkout-submit")}
            disabled={busy}
          >
            {busy ? "Procesando..." : "Pagar ahora"}
          </button>
        </ScenarioSlot>
      </form>
    </section>
  );
}

/**
 * A labelled field. With `ui.a11y_violations` the text is a plain <span>, so the input has no
 * accessible name (the classic missing-label violation).
 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  const broken = useUiFlag("ui.a11y_violations");
  if (broken) {
    return (
      <div className="field">
        <span>{label}</span>
        {children}
      </div>
    );
  }
  return (
    <label>
      {label}
      {children}
    </label>
  );
}

/**
 * `ui.a11y_violations`: a modal notice that ignores Escape and, once closed, does not give the
 * focus back to the element that opened it (the focus is lost on the page).
 */
function TrapModal() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Aviso"
      data-testid="trap-modal"
      className="card"
      onKeyDown={(e) => {
        if (e.key === "Escape") e.stopPropagation();
      }}
    >
      <p>Tus datos de pago son de prueba.</p>
      <button type="button" autoFocus onClick={() => setOpen(false)}>
        Entendido
      </button>
    </div>
  );
}
