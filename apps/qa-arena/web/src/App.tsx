import type { ReactNode } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router";
import { useAuth } from "./auth";
import { Assistant } from "./components/Assistant";
import { CartCounter } from "./components/CartCounter";
import { Admin } from "./pages/Admin";
import { CartPage } from "./pages/Cart";
import { Catalog } from "./pages/Catalog";
import { Checkout } from "./pages/Checkout";
import { Login } from "./pages/Login";
import { OrderDetail, Orders } from "./pages/Orders";
import { ProductDetail } from "./pages/ProductDetail";
import { Requirements } from "./pages/Requirements";
import { ScenarioBar } from "./scenario/ScenarioBar";
import { useVisualRegression } from "./scenario/ui-flags";

function Protected({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, ready } = useAuth();
  if (!ready) return <p data-testid="loading">Cargando...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") {
    return (
      <p role="alert" data-testid="forbidden">
        No tienes permiso para ver esta pagina.
      </p>
    );
  }
  return children;
}

export function App() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  useVisualRegression();
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand" data-testid="nav-home">
          QA Arena Shop
        </Link>
        <nav aria-label="Principal">
          <Link to="/" data-testid="nav-catalog">
            Catalogo
          </Link>
          {user && (
            <>
              <Link to="/cart" data-testid="nav-cart">
                Carrito
              </Link>
              <CartCounter />
            </>
          )}
          {user && (
            <Link to="/orders" data-testid="nav-orders">
              Mis pedidos
            </Link>
          )}
          {user?.role === "admin" && (
            <Link to="/admin" data-testid="nav-admin">
              Admin
            </Link>
          )}
        </nav>
        <div className="user">
          {user ? (
            <>
              <span data-testid="user-name">{user.name}</span>
              <button
                data-testid="logout"
                onClick={() => void logout().then(() => navigate("/login"))}
              >
                Salir
              </button>
            </>
          ) : (
            <Link to="/login" data-testid="nav-login">
              Ingresar
            </Link>
          )}
        </div>
      </header>
      <ScenarioBar />
      <main>
        <Routes>
          <Route path="/" element={<Catalog />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/requirements" element={<Requirements />} />
          <Route
            path="/cart"
            element={
              <Protected>
                <CartPage />
              </Protected>
            }
          />
          <Route
            path="/checkout"
            element={
              <Protected>
                <Checkout />
              </Protected>
            }
          />
          <Route
            path="/orders"
            element={
              <Protected>
                <Orders />
              </Protected>
            }
          />
          <Route
            path="/orders/:id"
            element={
              <Protected>
                <OrderDetail />
              </Protected>
            }
          />
          <Route
            path="/admin"
            element={
              <Protected admin>
                <Admin />
              </Protected>
            }
          />
          <Route path="*" element={<p data-testid="not-found">Pagina no encontrada</p>} />
        </Routes>
      </main>
      <Assistant />
    </>
  );
}
