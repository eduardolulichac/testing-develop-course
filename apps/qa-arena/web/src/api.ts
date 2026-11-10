export interface User {
  id: number;
  email: string;
  name: string;
  role: "customer" | "admin";
}
export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  category: string;
  stock: number;
  active: boolean;
}
export interface CartLine {
  productId: number;
  name: string;
  sku: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  stock: number;
}
export interface Cart {
  items: CartLine[];
  couponCode: string | null;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  couponWarning: string | null;
}
export interface Order {
  id: number;
  userId: number;
  status: "pending" | "paid" | "shipped" | "cancelled" | "payment_failed";
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  couponCode: string | null;
  shippingAddress: string;
  createdAt: string;
  items: { productId: number; name: string; unitPriceCents: number; quantity: number }[];
}
export interface ArenaState {
  session: string | null;
  scenario: string;
  release: string | null;
  releases: { id: string; label: string }[];
  seedVersion: string;
  environment: { label: "local" | "qa" | "staging"; banner?: string; clock?: string };
  /** Active defects of the web layer; the only ones the API reveals. */
  uiFlags: string[];
  hasRequirements: boolean;
  /** Runner Arena: the scenario controls are not painted. */
  runnerMode?: boolean;
  assistant: { mode: "normal" | "faulty"; faults: string[] };
}
export interface ScenarioSummary {
  id: string;
  title: string;
  module: string;
  publicSummary: string;
  releases: { id: string; label: string }[];
  hosted: boolean;
}
export interface Requirements {
  title: string;
  version: string;
  items: { id: string; source: string; text: string }[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data?: unknown,
  ) {
    super(message);
  }
}

const TOKEN_KEY = "arena.token";
export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  // 402 carries a full checkout result (declined payment), not just an error.
  if (!res.ok && res.status !== 402) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? "error",
      data?.error?.message ?? res.statusText,
      data,
    );
  }
  return Object.assign(data ?? {}, res.status === 402 ? { __status: 402 } : {}) as T;
}

export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
