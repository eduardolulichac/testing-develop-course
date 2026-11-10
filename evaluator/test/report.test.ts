import { describe, expect, it } from "vitest";
import {
  challengeResultPayloadSchema,
  deriveChallengeKey,
  formatChallengeKey,
  verifySignature,
} from "@course/shared";
import { sendResults, summaryTable, type ReportContext } from "../src/report.ts";
import type { ResultsFile } from "../src/results.ts";

const master = "m".repeat(40);
const keyId = "ck_3q2-7wEXAMPLE00000000a";
const key = deriveChallengeKey(master, keyId, 1);
const shownKey = formatChallengeKey(key);

const results: ResultsFile = {
  schema: "challenge-result/v1",
  exercise: "reto-1-1-login",
  evaluator: { version: "1.0.0" },
  arena: {
    image_digest: `sha256:${"b".repeat(64)}`,
    seed_version: "arena-seed-2+dirty+1046",
    scenario: "fase1-login",
    release: null,
    rng_seed: 1046,
  },
  criteria: [{ id: "suite-ejecuta", status: "pass", evidence: "4 tests encontrados" }],
  feedback: {},
  summary: { duration_ms: 10, tests_total: 4 },
};
const ctx: ReportContext = {
  keyId,
  shownKey,
  endpoint: "http://platform.test/api/webhooks/challenge-result",
  repo: { id: 1, full_name: "alumna/reto-1-1-login" },
  run: { id: 2, attempt: 1, commit_sha: "a".repeat(40), event: "push" },
  evaluatorSha: "c".repeat(40),
};

function harness(statuses: number[]) {
  const calls: Array<{ headers: Record<string, string>; body: string }> = [];
  const logs: string[] = [];
  const sleeps: number[] = [];
  let i = 0;
  const fetchFake = (async (_url: string, init: RequestInit) => {
    calls.push({ headers: init.headers as Record<string, string>, body: init.body as string });
    const status = statuses[Math.min(i++, statuses.length - 1)]!;
    return new Response(JSON.stringify(status < 300 ? { url: "http://x/retos" } : { error: "x" }), {
      status,
    });
  }) as unknown as typeof fetch;
  return {
    calls,
    logs,
    sleeps,
    deps: {
      fetch: fetchFake,
      now: () => 1_793_980_800_000 + i * 1000,
      sleep: async (ms: number) => void sleeps.push(ms),
      log: (l: string) => void logs.push(l),
    },
  };
}

describe("sendResults", () => {
  it("sends a payload the platform contract accepts, signed over the raw body", async () => {
    const h = harness([201]);
    const out = await sendResults(results, ctx, h.deps);
    expect(out.ok).toBe(true);
    const c = h.calls[0]!;
    expect(challengeResultPayloadSchema.safeParse(JSON.parse(c.body)).success).toBe(true);
    expect(
      verifySignature(
        c.headers["x-course-signature"]!,
        key,
        c.headers["x-course-timestamp"]!,
        c.headers["x-course-nonce"]!,
        c.body,
      ),
    ).toBe(true);
  });

  it("retries 5xx with a fresh nonce and signature each time", async () => {
    const h = harness([503, 503, 201]);
    const out = await sendResults(results, ctx, h.deps);
    expect(out.ok).toBe(true);
    expect(h.sleeps).toEqual([2000, 4000]);
    expect(new Set(h.calls.map((c) => c.headers["x-course-nonce"])).size).toBe(3);
    expect(new Set(h.calls.map((c) => c.headers["x-course-signature"])).size).toBe(3);
  });

  it("does not retry other 4xx and gives the code", async () => {
    const h = harness([401]);
    const out = await sendResults(results, ctx, h.deps);
    expect(h.calls).toHaveLength(1);
    expect(out).toMatchObject({ ok: false, status: 401 });
  });

  it("treats 200 already_recorded as success", async () => {
    expect((await sendResults(results, ctx, harness([200]).deps)).ok).toBe(true);
  });

  it("gives up after 3 retries", async () => {
    const h = harness([503]);
    const out = await sendResults(results, ctx, h.deps);
    expect(h.calls).toHaveLength(4);
    expect(out.ok).toBe(false);
  });

  it("never logs the key, its base64 body or its hex (T7)", async () => {
    const h = harness([503, 401]);
    const out = await sendResults(results, ctx, h.deps);
    const text = JSON.stringify([h.logs, out, summaryTable(results, null)]);
    for (const secret of [shownKey, shownKey.slice(4), key.toString("hex")]) {
      expect(text).not.toContain(secret);
    }
  });

  it("rejects a malformed key without sending", async () => {
    const h = harness([201]);
    const out = await sendResults(results, { ...ctx, shownKey: "nope" }, h.deps);
    expect(out).toMatchObject({
      ok: false,
      code: "bad_key",
      message: expect.stringContaining("43"),
    });
    expect(h.calls).toHaveLength(0);
  });
});
