// Full purchase flow against a running Arena. Usage: ARENA_URL=http://localhost:18080 pnpm smoke
const base = process.env.ARENA_URL ?? "http://localhost:18081";
const session = `smoke-${Date.now()}`;
let token = "";

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      "x-arena-session": session,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
function expect(cond: unknown, msg: string) {
  if (!cond) throw new Error(`SMOKE FAILED: ${msg}`);
  console.log(`ok - ${msg}`);
}

expect((await call("POST", "/__arena/reset")).status === 200, "reset");
const login = await call("POST", "/api/auth/login", {
  email: "ana@arena.test",
  password: "Cliente123!",
});
expect(login.status === 200, "login");
token = login.body.token;
expect((await call("GET", "/api/products")).body.total === 24, "catalog has 24 products");
expect(
  (await call("POST", "/api/cart/items", { productId: 1, quantity: 2 })).status === 200,
  "add to cart",
);
expect(
  (await call("POST", "/api/cart/coupon", { code: "WELCOME10" })).body.discountCents > 0,
  "coupon applied",
);
const co = await call("POST", "/api/checkout", {
  payment: { cardNumber: "4242424242424242", expMonth: 12, expYear: 2099, cvc: "123" },
  shippingAddress: "Calle Falsa 123",
});
expect(co.status === 201 && co.body.order.status === "paid", "checkout paid");
expect((await call("GET", "/api/orders")).body.length === 3, "order listed");
console.log("SMOKE OK");
