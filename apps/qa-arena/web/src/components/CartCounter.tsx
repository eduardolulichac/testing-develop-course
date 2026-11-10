import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { api, type Cart } from "../api";
import { useUiFlag } from "../scenario/ui-flags";

export const CART_CHANGED = "arena:cart-changed";
export const announceCart = (count: number) =>
  window.dispatchEvent(new CustomEvent(CART_CHANGED, { detail: count }));

/** Units in the cart, shown in the header. With `ui.state_mismatch` it never goes down. */
export function CartCounter() {
  const stale = useUiFlag("ui.state_mismatch");
  const [count, setCount] = useState(0);
  const location = useLocation();
  const apply = (n: number) => setCount((prev) => (stale ? Math.max(prev, n) : n));

  useEffect(() => {
    api<Cart>("GET", "/api/cart")
      .then((c) => apply(c.items.reduce((s, i) => s + i.quantity, 0)))
      .catch(() => undefined);
  }, [location.pathname, stale]);

  useEffect(() => {
    const onChange = (e: Event) => apply((e as CustomEvent<number>).detail);
    window.addEventListener(CART_CHANGED, onChange);
    return () => window.removeEventListener(CART_CHANGED, onChange);
  }, [stale]);

  return (
    <span data-testid="cart-count" aria-label="Unidades en el carrito">
      {count}
    </span>
  );
}
