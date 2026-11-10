import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { api, usd, type Cart, type Product } from "../api";
import { useAuth } from "../auth";
import { announceCart } from "../components/CartCounter";
import { ScenarioSlot } from "../scenario/ScenarioProvider";
import { useTestId } from "../scenario/ui-flags";

export function ProductDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [p, setP] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const tid = useTestId();

  useEffect(() => {
    api<Product>("GET", `/api/products/${id}`)
      .then(setP)
      .catch(() => setNotFound(true));
  }, [id]);

  async function add() {
    if (!user) return navigate("/login");
    try {
      const cart = await api<Cart>("POST", "/api/cart/items", { productId: p!.id, quantity: qty });
      announceCart(cart.items.reduce((s, i) => s + i.quantity, 0));
      setMsg({ kind: "ok", text: "Agregado al carrito" });
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  }

  if (notFound)
    return (
      <p role="alert" data-testid="product-not-found">
        Producto no encontrado
      </p>
    );
  if (!p) return <p data-testid="product-loading">Cargando...</p>;
  return (
    <section className="card" data-testid="product-detail">
      <p className="muted">
        {p.category} - {p.sku}
      </p>
      <h1 data-testid="product-name">{p.name}</h1>
      <p>{p.description}</p>
      <p className="price" data-testid="product-price">
        {usd(p.priceCents)}
      </p>
      <p data-testid="product-stock">{p.stock > 0 ? `${p.stock} disponibles` : "Agotado"}</p>
      <label>
        Cantidad
        <input
          data-testid="product-qty"
          type="number"
          min={1}
          max={10}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        />
      </label>
      <ScenarioSlot name="product.add-to-cart">
        <button
          className="primary"
          data-testid={tid("add-to-cart")}
          disabled={p.stock === 0}
          onClick={() => void add()}
        >
          Agregar al carrito
        </button>
      </ScenarioSlot>
      {msg && (
        <p
          role={msg.kind === "error" ? "alert" : "status"}
          className={msg.kind === "error" ? "error" : "ok"}
          data-testid="product-message"
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
