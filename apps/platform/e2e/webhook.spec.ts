import { randomBytes, randomInt } from "node:crypto";
import { expect, test } from "./support/fixtures";
import { seed, signedRequest, type Seed } from "./support/webhook-seed";

const URL = "/api/webhooks/challenge-result";

test.describe("challenge webhook", () => {
  let s: Seed;
  test.beforeEach(async () => {
    s = await seed();
  });
  test.afterEach(async () => {
    await s.cleanup();
  });

  test("records a signed submission, rejects a replay and a tampered body", async ({ request }) => {
    const run = randomInt(1, 2_000_000_000);
    const nonce = randomBytes(16).toString("base64url");
    const ok = await request.post(URL, signedRequest(s, run, { nonce }));
    expect(ok.status()).toBe(201);
    expect(await ok.json()).toMatchObject({ resultado: "aprobado", puntaje: 100 });

    const replay = await request.post(URL, signedRequest(s, run + 1, { nonce }));
    expect(replay.status()).toBe(409);

    const again = await request.post(URL, signedRequest(s, run));
    expect(again.status()).toBe(200);
    expect(await again.json()).toMatchObject({ status: "already_recorded" });

    const tampered = await request.post(URL, signedRequest(s, run + 2, { tamper: true }));
    expect(tampered.status()).toBe(401);
  });

  test("lets exactly 10 of 20 simultaneous submissions through", async ({ request }) => {
    const base = randomInt(1, 1_000_000_000);
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) => request.post(URL, signedRequest(s, base + i))),
    );
    const statuses = responses.map((r) => r.status());
    expect(statuses.filter((c) => c === 201)).toHaveLength(10);
    expect(statuses.filter((c) => c === 429)).toHaveLength(10);
  });

  test("is not served by the session proxy: a GET answers 405 without redirects", async ({
    request,
  }) => {
    const res = await request.get(URL, { maxRedirects: 0 });
    expect(res.status()).toBe(405);
  });
});
