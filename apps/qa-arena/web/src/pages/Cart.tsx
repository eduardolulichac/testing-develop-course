import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, usd, type Cart } from "../api";
import { announceCart } from "../components/CartCounter";
import { ScenarioSlot } from "../scenario/ScenarioProvider";
import { useLateReady, useTestId, useUiFlag } from "../scenario/ui-flags";

export function CartPage() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [coupon, setCoupon] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = useLateReady("cart");
  const tid = useTestId();
  const doubleSubmit = useUiFlag("ui.double_submit");
  const a11y = useUiFlag("ui.a11y_violations");

  useEffect(() => {
    api<Cart>("GET", "/api/cart")
      .then(setCart)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function act(fn: () => Promise<Cart>) {
    setBusy(true);
    try {
      const next = await fn();
      setCart(next);
      announceCart(next.items.reduce((s, i) => s + i.quantity, 0));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!cart || !ready) {
    return (
      <p data-testid={cart ? "cart-skeleton" : "cart-loading"} aria-busy="true">
        Cargando...
      </p>
    );
  }
  return (
    <section>
      <h1>Carrito</h1>
      {error && (
        <p role="alert" className="error" data-testid="cart-error">
          {error}
        </p>
      )}
      {cart.items.length === 0 ? (
        <p data-testid="cart-empty">
          Tu carrito esta vacio. <Link to="/">Ver catalogo</Link>
        </p>
      ) : (
        <table data-testid="cart-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Precio</th>
              <th>Cantidad</th>
              <th>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cart.items.map((i) => (
              <tr key={i.productId} data-testid={`cart-item-${i.productId}`}>
                <td>{i.name}</td>
                <td>{usd(i.unitPriceCents)}</td>
                <td>
                  <input
                    data-testid={`cart-qty-${i.productId}`}
                    aria-label={`Cantidad de ${i.name}`}
                    type="number"
                    min={0}
                    max={10}
                    defaultValue={i.quantity}
                    onBlur={(e) =>
                      void act(() =>
                        api("PATCH", `/api/cart/items/${i.productId}`, {
                          quantity: Number(e.target.value),
                        }),
                      )
                    }
                  />
                </td>
                <td
                  data-testid={`cart-line-total-${i.productId}`}
                  className={a11y ? "low-contrast" : undefined}
                >
                  {usd(i.lineTotalCents)}
                </td>
                <td>
                  <button
                    data-testid={`cart-remove-${i.productId}`}
                    onClick={() => void act(() => api("DELETE", `/api/cart/items/${i.productId}`))}
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {cart.items.length > 0 && (
        <div className="card summary">
          <div className="row">
            <input
              data-testid="coupon-input"
              // `ui.a11y_violations`: neither label nor placeholder, so the field has no accessible name.
              aria-label={a11y ? undefined : "Cupon"}
              placeholder={a11y ? undefined : "Codigo de cupon"}
              value={coupon}
              onChange={(e) => setCoupon(e.target.value)}
            />
            <ScenarioSlot name="cart.apply-coupon">
              <button
                data-testid={tid("coupon-apply")}
                // `ui.double_submit`: the button stays enabled while the request is in flight.
                disabled={busy && !doubleSubmit}
                onClick={() => void act(() => api("POST", "/api/cart/coupon", { code: coupon }))}
              >
                Aplicar
              </button>
            </ScenarioSlot>
            {cart.couponCode && (
              <button
                className="link"
                data-testid="coupon-remove"
                onClick={() => void act(() => api("DELETE", "/api/cart/coupon"))}
              >
                Quitar cupon {cart.couponCode}
              </button>
            )}
          </div>
          {cart.couponWarning && (
            <p className="error" data-testid="coupon-warning">
              {cart.couponWarning}
            </p>
          )}
          <dl>
            <dt>Subtotal</dt>
            <dd data-testid="cart-subtotal">{usd(cart.subtotalCents)}</dd>
            <dt>Descuento</dt>
            <dd data-testid="cart-discount">-{usd(cart.discountCents)}</dd>
            <dt>Envio</dt>
            <dd data-testid="cart-shipping">{usd(cart.shippingCents)}</dd>
            <dt>Total</dt>
            <dd data-testid="cart-total">
              <strong>{usd(cart.totalCents)}</strong>
            </dd>
          </dl>
          <Link to="/checkout" className="button primary" data-testid="go-checkout">
            Ir a pagar
          </Link>
        </div>
      )}
    </section>
  );
}
