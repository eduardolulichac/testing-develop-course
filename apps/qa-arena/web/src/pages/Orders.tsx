import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { api, usd, type Order } from "../api";

export const STATUS_LABEL: Record<Order["status"], string> = {
  pending: "Pendiente",
  paid: "Pagado",
  shipped: "Enviado",
  cancelled: "Cancelado",
  payment_failed: "Pago fallido",
};

export function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  useEffect(() => {
    api<Order[]>("GET", "/api/orders").then(setOrders);
  }, []);
  if (!orders) return <p data-testid="orders-loading">Cargando...</p>;
  return (
    <section>
      <h1>Mis pedidos</h1>
      {orders.length === 0 && <p data-testid="orders-empty">Aun no tienes pedidos</p>}
      <ul className="list" data-testid="order-list">
        {orders.map((o) => (
          <li key={o.id} className="card" data-testid={`order-row-${o.id}`}>
            <Link to={`/orders/${o.id}`} data-testid={`order-link-${o.id}`}>
              Pedido #{o.id}
            </Link>
            <span data-testid={`order-status-${o.id}`} className={`badge ${o.status}`}>
              {STATUS_LABEL[o.status]}
            </span>
            <span data-testid={`order-total-${o.id}`}>{usd(o.totalCents)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [o, setO] = useState<Order | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    api<Order>("GET", `/api/orders/${id}`)
      .then(setO)
      .catch(() => setMissing(true));
  }, [id]);
  if (missing)
    return (
      <p role="alert" data-testid="order-not-found">
        Pedido no encontrado
      </p>
    );
  if (!o) return <p data-testid="order-loading">Cargando...</p>;
  return (
    <section className="card" data-testid="order-detail">
      {params.get("paid") && (
        <p role="status" className="ok" data-testid="order-success">
          Pago aprobado. Gracias por tu compra.
        </p>
      )}
      <h1>Pedido #{o.id}</h1>
      <p>
        Estado:{" "}
        <span data-testid="order-status" className={`badge ${o.status}`}>
          {STATUS_LABEL[o.status]}
        </span>
      </p>
      <ul data-testid="order-items">
        {o.items.map((i) => (
          <li key={i.productId}>
            {i.quantity} x {i.name} - {usd(i.unitPriceCents * i.quantity)}
          </li>
        ))}
      </ul>
      <dl>
        <dt>Subtotal</dt>
        <dd>{usd(o.subtotalCents)}</dd>
        <dt>Descuento</dt>
        <dd>-{usd(o.discountCents)}</dd>
        <dt>Envio</dt>
        <dd>{usd(o.shippingCents)}</dd>
        <dt>Total</dt>
        <dd data-testid="order-total">
          <strong>{usd(o.totalCents)}</strong>
        </dd>
      </dl>
      <p className="muted">Envio a: {o.shippingAddress}</p>
    </section>
  );
}
