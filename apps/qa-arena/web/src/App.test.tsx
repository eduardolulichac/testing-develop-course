import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { AuthProvider } from "./auth";
import { ScenarioProvider } from "./scenario/ScenarioProvider";

const product = {
  id: 7,
  sku: "ARN-007",
  name: "Lampara LED",
  description: "d",
  priceCents: 2000,
  category: "Hogar",
  stock: 5,
  active: true,
};
const user = { id: 1, email: "ana@arena.test", name: "Ana Cliente", role: "customer" };

/** In-memory stand-in for the API, enough for the purchase flow. */
function fakeApi(declined = false) {
  let cart: { productId: number; quantity: number }[] = [];
  const view = () => {
    const subtotal = cart.reduce((s, i) => s + i.quantity * product.priceCents, 0);
    return {
      items: cart.map((i) => ({
        productId: i.productId,
        name: product.name,
        sku: product.sku,
        unitPriceCents: product.priceCents,
        quantity: i.quantity,
        lineTotalCents: i.quantity * product.priceCents,
        stock: 5,
      })),
      couponCode: null,
      subtotalCents: subtotal,
      discountCents: 0,
      shippingCents: 500,
      totalCents: subtotal + 500,
      couponWarning: null,
    };
  };
  const order = (status: string) => ({
    id: 3,
    userId: 1,
    status,
    subtotalCents: 4000,
    discountCents: 0,
    shippingCents: 500,
    totalCents: 4500,
    couponCode: null,
    shippingAddress: "Calle 1234",
    createdAt: "2026-01-01T00:00:00Z",
    items: [{ productId: 7, name: product.name, unitPriceCents: 2000, quantity: 2 }],
  });
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (url === "/__arena/state")
      return json({
        session: "s",
        scenario: "baseline",
        release: null,
        releases: [],
        seedVersion: "x",
        environment: { label: "local" },
        uiFlags: [],
        hasRequirements: false,
        assistant: { mode: "normal", faults: [] },
      });
    if (url === "/api/auth/login")
      return body.password === "Cliente123!"
        ? json({ token: "tok", user })
        : json({ error: { code: "unauthorized", message: "Invalid email or password" } }, 401);
    if (url.startsWith("/api/products?"))
      return json({ items: [product], page: 1, pageSize: 12, total: 1, categories: ["Hogar"] });
    if (url === "/api/products/7") return json(product);
    if (url === "/api/cart/items" && method === "POST") {
      cart = [{ productId: body.productId, quantity: body.quantity }];
      return json(view());
    }
    if (url === "/api/cart") return json(view());
    if (url === "/api/checkout") {
      cart = declined ? cart : [];
      return json(
        {
          order: order(declined ? "payment_failed" : "paid"),
          paymentStatus: declined ? "declined" : "approved",
          reason: declined ? "card_declined" : null,
        },
        declined ? 402 : 201,
      );
    }
    if (url === "/api/orders/3") return json(order("paid"));
    return json({ error: { code: "not_found", message: url } }, 404);
  });
}

function renderApp() {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <ScenarioProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ScenarioProvider>
    </MemoryRouter>,
  );
}

const byId = (id: string) => screen.findByTestId(id);

beforeEach(() => vi.unstubAllGlobals());

describe("purchase flow", () => {
  it("logs in, adds to cart, pays and sees the paid order", async () => {
    vi.stubGlobal("fetch", fakeApi());
    const u = userEvent.setup();
    renderApp();

    await u.type(await byId("login-email"), "ana@arena.test");
    await u.type(screen.getByTestId("login-password"), "Cliente123!");
    await u.click(screen.getByTestId("login-submit"));

    await u.click(await byId("product-link-7"));
    const qty = await byId("product-qty");
    await u.clear(qty);
    await u.type(qty, "2");
    await u.click(screen.getByTestId("add-to-cart"));
    expect(await byId("product-message")).toHaveTextContent("Agregado al carrito");

    await u.click(screen.getByTestId("nav-cart"));
    expect(await byId("cart-total")).toHaveTextContent("$45.00");
    await u.click(screen.getByTestId("go-checkout"));

    await u.type(await byId("checkout-address"), "Calle 1234");
    await u.click(screen.getByTestId("checkout-submit"));

    expect(await byId("order-success")).toBeInTheDocument();
    expect(screen.getByTestId("order-status")).toHaveTextContent("Pagado");
  });

  it("shows an error for wrong credentials and a message when the payment is declined", async () => {
    vi.stubGlobal("fetch", fakeApi(true));
    const u = userEvent.setup();
    renderApp();
    await u.type(await byId("login-email"), "ana@arena.test");
    await u.type(screen.getByTestId("login-password"), "bad");
    await u.click(screen.getByTestId("login-submit"));
    expect(await byId("login-error")).toHaveTextContent("Invalid email or password");

    await u.clear(screen.getByTestId("login-password"));
    await u.type(screen.getByTestId("login-password"), "Cliente123!");
    await u.click(screen.getByTestId("login-submit"));
    await u.click(await byId("product-link-7"));
    await u.click(await byId("add-to-cart"));
    await waitFor(() => expect(screen.getByTestId("product-message")).toBeInTheDocument());
    await u.click(screen.getByTestId("nav-cart"));
    await u.click(await byId("go-checkout"));
    await u.type(await byId("checkout-address"), "Calle 1234");
    await u.click(screen.getByTestId("checkout-submit"));
    expect(await byId("checkout-error")).toHaveTextContent("Tarjeta rechazada");
  });
});
