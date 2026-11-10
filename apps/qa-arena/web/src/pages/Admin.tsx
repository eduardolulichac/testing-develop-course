import { useEffect, useState } from "react";
import { api, usd, type Order, type Product } from "../api";
import { STATUS_LABEL } from "./Orders";

export function Admin() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    Promise.all([
      api<Order[]>("GET", "/api/admin/orders"),
      api<Product[]>("GET", "/api/admin/products"),
    ])
      .then(([o, p]) => {
        setOrders(o);
        setProducts(p);
      })
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section>
      <h1>Panel de administracion</h1>
      {error && (
        <p role="alert" className="error" data-testid="admin-error">
          {error}
        </p>
      )}
      <h2>Pedidos</h2>
      <table data-testid="admin-orders">
        <thead>
          <tr>
            <th>#</th>
            <th>Cliente</th>
            <th>Estado</th>
            <th>Total</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} data-testid={`admin-order-${o.id}`}>
              <td>{o.id}</td>
              <td>{o.userId}</td>
              <td data-testid={`admin-order-status-${o.id}`}>{STATUS_LABEL[o.status]}</td>
              <td>{usd(o.totalCents)}</td>
              <td>
                {o.status === "paid" && (
                  <>
                    <button
                      data-testid={`admin-ship-${o.id}`}
                      onClick={() =>
                        void act(() =>
                          api("PATCH", `/api/admin/orders/${o.id}/status`, { status: "shipped" }),
                        )
                      }
                    >
                      Enviar
                    </button>
                    <button
                      data-testid={`admin-cancel-${o.id}`}
                      onClick={() =>
                        void act(() =>
                          api("PATCH", `/api/admin/orders/${o.id}/status`, { status: "cancelled" }),
                        )
                      }
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Inventario</h2>
      <table data-testid="admin-inventory">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Producto</th>
            <th>Precio</th>
            <th>Stock</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} data-testid={`admin-product-${p.id}`}>
              <td>{p.sku}</td>
              <td>{p.name}</td>
              <td>{usd(p.priceCents)}</td>
              <td>
                <input
                  data-testid={`admin-stock-${p.id}`}
                  aria-label={`Stock de ${p.name}`}
                  type="number"
                  min={0}
                  defaultValue={p.stock}
                  key={`${p.id}-${p.stock}`}
                  onBlur={(e) => {
                    const stock = Number(e.target.value);
                    if (stock !== p.stock)
                      void act(() => api("PUT", `/api/admin/inventory/${p.id}`, { stock }));
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
