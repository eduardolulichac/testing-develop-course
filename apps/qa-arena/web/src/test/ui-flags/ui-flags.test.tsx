import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { AuthProvider } from "../../auth";
import { announceCart, CartCounter } from "../../components/CartCounter";
import { CartPage } from "../../pages/Cart";
import { Catalog } from "../../pages/Catalog";
import { Checkout } from "../../pages/Checkout";
import { Login } from "../../pages/Login";
import { ScenarioProvider } from "../../scenario/ScenarioProvider";
import { misspell } from "../../scenario/ui-flags";

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
const cartView = {
  items: [
    {
      productId: 7,
      name: "Lampara LED",
      sku: "ARN-007",
      unitPriceCents: 2000,
      quantity: 2,
      lineTotalCents: 4000,
      stock: 5,
    },
  ],
  couponCode: null,
  subtotalCents: 4000,
  discountCents: 0,
  shippingCents: 500,
  totalCents: 4500,
  couponWarning: null,
};

interface Setup {
  flags?: string[];
  release?: string | null;
  seedVersion?: string;
  /** Delay for POST /api/cart/coupon, to observe the in-flight state. */
  couponDelayMs?: number;
}

function stubApi(o: Setup = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (url === "/__arena/state") {
        return json({
          session: "s",
          scenario: "t",
          release: o.release ?? null,
          releases: [],
          seedVersion: o.seedVersion ?? "arena-seed-2+clean+1",
          environment: { label: "local" },
          uiFlags: o.flags ?? [],
          hasRequirements: false,
          assistant: { mode: "normal", faults: [] },
        });
      }
      if (url === "/__arena/scenarios") return json([]);
      if (url.startsWith("/api/products?"))
        return json({ items: [product], page: 1, pageSize: 12, total: 1, categories: ["Hogar"] });
      if (url === "/api/cart" || url.startsWith("/api/cart/items")) return json(cartView);
      if (url === "/api/cart/coupon" && init?.method === "POST") {
        await new Promise((r) => setTimeout(r, o.couponDelayMs ?? 0));
        return json(cartView);
      }
      if (url === "/api/auth/login")
        return json({ error: { code: "unauthorized", message: "Invalid email or password" } }, 401);
      return json({ error: { code: "not_found", message: url } }, 404);
    }),
  );
}

function mount(ui: ReactNode) {
  return render(
    <MemoryRouter>
      <ScenarioProvider>
        <AuthProvider>{ui}</AuthProvider>
      </ScenarioProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  document.body.className = "";
});
afterEach(() => vi.useRealTimers());

describe("ui.typo_messages", () => {
  async function loginError(flags: string[]) {
    stubApi({ flags });
    const u = userEvent.setup();
    mount(<Login />);
    await u.type(await screen.findByTestId("login-email"), "a@b.test");
    await u.type(screen.getByTestId("login-password"), "x");
    await u.click(screen.getByTestId("login-submit"));
    return (await screen.findByTestId("login-error")).textContent;
  }
  it("misspells the error message", async () => {
    expect(await loginError(["ui.typo_messages"])).toBe(misspell("Invalid email or password"));
    expect(misspell("Invalid email or password")).not.toBe("Invalid email or password");
  });
  it("keeps it intact without the flag", async () => {
    expect(await loginError([])).toBe("Invalid email or password");
  });
});

describe("ui.testid_rotating", () => {
  it("paints no data-testid on tid() elements until the state arrives (A4)", async () => {
    stubApi({ flags: ["ui.testid_rotating"] });
    mount(<Login />);
    const button = screen.getByRole("button", { name: /entrar|iniciar|login|acceder/i });
    expect(button.hasAttribute("data-testid")).toBe(false);
    expect(document.querySelector('[data-testid^="login-submit"]')).toBeNull();
    await waitFor(() =>
      expect(document.querySelector('[data-testid^="login-submit-"]')).not.toBeNull(),
    );
    expect(screen.queryByTestId("login-submit")).toBeNull();
  });
  it("keeps the stable data-testid once the state has loaded without the flag", async () => {
    stubApi({});
    mount(<Login />);
    expect(screen.queryByTestId("login-submit")).toBeNull();
    expect(await screen.findByTestId("login-submit")).toBeTruthy();
  });
  const submitId = async (o: Setup) => {
    stubApi(o);
    const view = mount(<Login />);
    await waitFor(() =>
      expect(document.querySelector('[data-testid^="login-submit"]')).not.toBeNull(),
    );
    const id = document.querySelector('[data-testid^="login-submit"]')!.getAttribute("data-testid");
    view.unmount();
    return id;
  };
  it("adds a suffix that depends on the seed and the release", async () => {
    const on = { flags: ["ui.testid_rotating"] };
    const a = await submitId({ ...on, release: "v1.0.0" });
    expect(a).toMatch(/^login-submit-[a-z0-9]+$/);
    expect(await submitId({ ...on, release: "v1.0.0" })).toBe(a); // reproducible
    expect(await submitId({ ...on, release: "v1.1.0" })).not.toBe(a);
    expect(await submitId({ ...on, seedVersion: "arena-seed-2+clean+2" })).not.toBe(a);
  });
  it("keeps the plain id without the flag", async () => {
    expect(await submitId({})).toBe("login-submit");
  });
});

describe("ui.ambiguous_labels", () => {
  it("renders two buttons with the same accessible name per card", async () => {
    stubApi({ flags: ["ui.ambiguous_labels"] });
    mount(<Catalog />);
    expect(await screen.findAllByRole("button", { name: "Agregar" })).toHaveLength(2);
  });
  it("has none without the flag", async () => {
    stubApi();
    mount(<Catalog />);
    await screen.findByTestId("product-card-7");
    expect(screen.queryAllByRole("button", { name: "Agregar" })).toHaveLength(0);
  });
});

describe("ui.late_loading", () => {
  it("shows a skeleton for 1.5–3 s before the products", async () => {
    stubApi({ flags: ["ui.late_loading"] });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount(<Catalog />);
    expect(await screen.findByTestId("catalog-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("product-card-7")).toBeNull();
    expect(screen.getByTestId("page-next")).toBeInTheDocument(); // visible before it is ready
    await act(async () => void vi.advanceTimersByTime(1400));
    expect(screen.queryByTestId("product-card-7")).toBeNull();
    await act(async () => void vi.advanceTimersByTime(1700));
    expect(await screen.findByTestId("product-card-7")).toBeInTheDocument();
  });
  it("is immediate without the flag", async () => {
    stubApi();
    mount(<Catalog />);
    expect(await screen.findByTestId("product-card-7")).toBeInTheDocument();
  });
});

describe("ui.double_submit", () => {
  async function applyWhileInFlight(flags: string[]) {
    stubApi({ flags, couponDelayMs: 300 });
    const u = userEvent.setup();
    mount(<CartPage />);
    await u.type(await screen.findByTestId("coupon-input"), "SAVE5");
    await u.click(screen.getByTestId("coupon-apply"));
    return screen.getByTestId("coupon-apply") as HTMLButtonElement;
  }
  it("keeps the button enabled while the request is in flight", async () => {
    expect((await applyWhileInFlight(["ui.double_submit"])).disabled).toBe(false);
  });
  it("disables it without the flag", async () => {
    expect((await applyWhileInFlight([])).disabled).toBe(true);
  });
});

describe("ui.state_mismatch", () => {
  async function counterAfterRemoval(flags: string[]) {
    stubApi({ flags });
    mount(<CartCounter />);
    await screen.findByTestId("cart-count");
    await waitFor(() => expect(screen.getByTestId("cart-count")).toHaveTextContent("2"));
    act(() => announceCart(3));
    act(() => announceCart(1)); // a line was removed
    return screen.getByTestId("cart-count").textContent;
  }
  it("does not go down when a line is removed", async () => {
    expect(await counterAfterRemoval(["ui.state_mismatch"])).toBe("3");
  });
  it("follows the cart without the flag", async () => {
    expect(await counterAfterRemoval([])).toBe("1");
  });
});

describe("ui.a11y_violations", () => {
  const labelViolations = async () => {
    const r = await axe.run(document.body, {
      runOnly: ["label"],
      rules: { "color-contrast": { enabled: false } },
    });
    return r.violations.map((v) => v.id);
  };
  it("leaves the checkout inputs without a label and keeps a modal that ignores Escape", async () => {
    stubApi({ flags: ["ui.a11y_violations"] });
    const u = userEvent.setup();
    mount(<Checkout />);
    await screen.findByTestId("checkout-form");
    expect(await labelViolations()).toContain("label");
    expect(screen.queryByLabelText("Direccion de envio")).toBeNull();
    expect(screen.getByTestId("checkout-total").querySelector(".low-contrast")).not.toBeNull();
    await u.keyboard("{Escape}");
    expect(screen.getByTestId("trap-modal")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Entendido" }));
    expect(screen.queryByTestId("trap-modal")).toBeNull();
    expect(document.body).toHaveFocus();
  });
  it("seeds the same kinds of violations in the catalog and the cart", async () => {
    stubApi({ flags: ["ui.a11y_violations"] });
    const catalog = mount(<Catalog />);
    await screen.findByTestId("product-card-7");
    expect(screen.queryByLabelText("Buscar productos")).toBeNull();
    expect(screen.getByTestId("product-price-7")).toHaveClass("low-contrast");
    expect(await labelViolations()).toContain("label");
    catalog.unmount();
    mount(<CartPage />);
    await screen.findByTestId("coupon-input");
    expect(screen.queryByLabelText("Cupon")).toBeNull();
    expect(screen.getByTestId("cart-line-total-7")).toHaveClass("low-contrast");
  });
  it("is accessible without the flag", async () => {
    stubApi();
    mount(<Checkout />);
    await screen.findByTestId("checkout-form");
    expect(await labelViolations()).toEqual([]);
    expect(screen.getByLabelText("Direccion de envio")).toBeInTheDocument();
    expect(screen.queryByTestId("trap-modal")).toBeNull();
  });
});

describe("ui.visual_regression", () => {
  const renderApp = () =>
    render(
      <MemoryRouter>
        <ScenarioProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ScenarioProvider>
      </MemoryRouter>,
    );
  it("adds the arena-v2 class to the body", async () => {
    stubApi({ flags: ["ui.visual_regression"] });
    renderApp();
    await waitFor(() => expect(document.body).toHaveClass("arena-v2"));
  });
  it("does not without the flag", async () => {
    stubApi();
    renderApp();
    await screen.findByTestId("scenario-bar");
    expect(document.body).not.toHaveClass("arena-v2");
  });
});
