import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, usd, type Product } from "../api";
import { useLateReady, useUiFlag } from "../scenario/ui-flags";

interface Page {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
  categories: string[];
}

export function Catalog() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = useLateReady("catalog");
  const ambiguous = useUiFlag("ui.ambiguous_labels");
  const a11y = useUiFlag("ui.a11y_violations");
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams({ sort, page: String(page), pageSize: "12" });
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    api<Page>("GET", `/api/products?${params}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [q, category, sort, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <section>
      <h1>Catalogo</h1>
      <div className="filters">
        <input
          data-testid="catalog-search"
          type="search"
          // `ui.a11y_violations`: neither label nor placeholder, so the field has no accessible name.
          placeholder={a11y ? undefined : "Buscar productos"}
          aria-label={a11y ? undefined : "Buscar productos"}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          data-testid="catalog-category"
          aria-label="Categoria"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas las categorias</option>
          {data?.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          data-testid="catalog-sort"
          aria-label="Orden"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="name">Nombre</option>
          <option value="price_asc">Precio: menor a mayor</option>
          <option value="price_desc">Precio: mayor a menor</option>
        </select>
      </div>
      {error && (
        <p role="alert" className="error" data-testid="catalog-error">
          {error}
        </p>
      )}
      {((!data && !error) || !ready) && (
        <p data-testid={ready ? "catalog-loading" : "catalog-skeleton"} aria-busy="true">
          Cargando...
        </p>
      )}
      {ready && data && data.items.length === 0 && (
        <p data-testid="catalog-empty">Sin resultados</p>
      )}
      <ul className="grid" data-testid="product-list">
        {(ready ? data?.items : undefined)?.map((p) => (
          <li key={p.id} className="card" data-testid={`product-card-${p.id}`}>
            <p className="muted">{p.category}</p>
            <h2>
              <Link to={`/products/${p.id}`} data-testid={`product-link-${p.id}`}>
                {p.name}
              </Link>
            </h2>
            <p
              className={a11y ? "price low-contrast" : "price"}
              data-testid={`product-price-${p.id}`}
            >
              {usd(p.priceCents)}
            </p>
            <p className={p.stock > 0 ? "muted" : "error"} data-testid={`product-stock-${p.id}`}>
              {p.stock > 0 ? `${p.stock} disponibles` : "Agotado"}
            </p>
            {ambiguous && (
              // `ui.ambiguous_labels`: two buttons with the same visible and accessible name.
              <div className="row">
                <button onClick={() => navigate(`/products/${p.id}`)}>Agregar</button>
                <button onClick={() => navigate(`/products/${p.id}`)}>Agregar</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="pager">
        <button data-testid="page-prev" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Anterior
        </button>
        <span data-testid="page-info">
          Pagina {page} de {pages}
        </span>
        <button data-testid="page-next" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          Siguiente
        </button>
      </div>
    </section>
  );
}
