import { randomBytes } from "node:crypto";
import { computeSignature, deriveChallengeKey } from "@course/shared";
import { describe, expect, it, vi } from "vitest";
import type { GitHubRunVerifier, VerifyResult } from "./verify";
import { clientIp, handleChallengeResult, type GateLink, type WebhookDeps } from "./webhook";

const MASTER = "unit-test-master-secret-0123456789abcdef-xyz";
const KEY_ID = "ck_3q2-7wEXAMPLE00000000a";
const NOW_MS = 1_793_980_800_000;
const EVALUATOR_SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";

const criteria = {
  version: 1,
  arena: { escenario: "fase1-login", release: null, semilla: 1046 },
  umbral: 70,
  obligatorios: ["suite-ejecuta"],
  criterios: [
    {
      id: "suite-ejecuta",
      titulo: "La suite se ejecuta",
      peso: 30,
      competencia: "tecnica",
      feedback_fallo: "Revisa que tengas tests",
      tipo: "suite_ejecuta",
      min: 1,
    },
    {
      id: "detecta-fase1-login",
      titulo: "Detecta el defecto",
      peso: 70,
      competencia: "analisis",
      feedback_fallo: "La suite no detecta el defecto",
      tipo: "suite_detecta",
      escenario: "fase1-login",
      release: null,
    },
  ],
};

const link: GateLink = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  key_version: 1,
  revoked_at: null,
  exercise_id: "33333333-3333-4333-8333-333333333333",
  exercise_slug: "reto-1-1-login",
  exercise_tipo: "reto",
  lesson_estado: "publicado",
  repo_id: 912345678,
  repo_full_name: "alumna/reto-1-1-login",
  github_id: 4242,
  criterio_aprobacion: criteria,
};

function payload(
  overrides: Record<string, unknown> = {},
  ts = NOW_MS / 1000,
  nonce = "pX0v6l2nRk5a7wq1Zb9cYg",
) {
  return {
    schema: "challenge-result/v1",
    key_id: KEY_ID,
    timestamp: ts,
    nonce,
    exercise: "reto-1-1-login",
    repo: { id: 912345678, full_name: "alumna/reto-1-1-login" },
    run: {
      id: 18234567890,
      attempt: 1,
      commit_sha: "4f1c0e5b9a7d3c2e1f0a9b8c7d6e5f4a3b2c1d0e",
      event: "push",
    },
    evaluator: { version: "1.0.0", sha: EVALUATOR_SHA },
    arena: {
      image_digest: `sha256:${"a".repeat(64)}`,
      seed_version: "arena-seed-2",
      scenario: "fase1-login",
      release: null,
      rng_seed: 1046,
    },
    criteria: [
      { id: "suite-ejecuta", status: "pass", evidence: "4 tests" },
      { id: "detecta-fase1-login", status: "pass", evidence: "4/4 fallan" },
    ],
    ...overrides,
  };
}

/** Builds a signed request. `keyVersion` and `tamper` let tests break one thing at a time. */
function signed(
  body: object | string,
  opts: {
    keyVersion?: number;
    tamper?: boolean;
    ts?: number;
    nonce?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const nonce = opts.nonce ?? (body as { nonce?: string }).nonce ?? "pX0v6l2nRk5a7wq1Zb9cYg";
  const ts = String(opts.ts ?? (body as { timestamp?: number }).timestamp ?? NOW_MS / 1000);
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const key = deriveChallengeKey(MASTER, KEY_ID, opts.keyVersion ?? 1);
  const signature = computeSignature(key, ts, nonce, raw);
  return new Request("http://localhost/api/webhooks/challenge-result", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-course-key-id": KEY_ID,
      "x-course-timestamp": ts,
      "x-course-nonce": nonce,
      "x-course-signature": signature,
      ...opts.headers,
    },
    body: opts.tamper ? raw.replace("4 tests", "5 tests") : raw,
  });
}

function makeDeps(
  over: Partial<WebhookDeps> & {
    verify?: () => Promise<VerifyResult>;
    link?: GateLink | null;
  } = {},
) {
  const nonces = new Set<string>();
  const runs = new Map<string, { id: string; final?: boolean }>();
  let intento = 0;
  const verifier: GitHubRunVerifier = {
    verify: vi.fn(
      over.verify ?? (async () => ({ ok: true as const, snapshot: { status: "in_progress" } })),
    ),
  };
  const deps = {
    now: () => NOW_MS,
    masterSecret: MASTER,
    siteUrl: "http://localhost:3100",
    evaluator: {
      repo: "eduardolulichac/qa-course-evaluator",
      workflowPath: ".github/workflows/evaluate.yml",
      allowed: new Set([`1.0.0@${EVALUATOR_SHA}`]),
    },
    verifier,
    gate: vi.fn(async () => ({ limited: false, link: over.link === undefined ? link : over.link })),
    reserve: vi.fn(async (a) => {
      if (nonces.has(a.nonce)) return { status: "replay" as const };
      nonces.add(a.nonce);
      const k = `${a.runId}:${a.runAttempt}`;
      const existing = runs.get(k);
      if (existing?.final) {
        return {
          status: "already" as const,
          submission: { id: existing.id, resultado: "aprobado", puntaje: 100 },
        };
      }
      if (existing) return { status: "reverify" as const, id: existing.id };
      const id = randomBytes(4).toString("hex");
      runs.set(k, { id });
      return { status: "reserved" as const, id };
    }),
    finalize: vi.fn(async (i) => {
      for (const r of runs.values())
        if (r.id === i.id && i.estado !== "error_verificacion") r.final = true;
      if (i.estado === "verificado" && i.resultado !== "error") intento += 1;
      return {
        updated: true,
        submission: {
          id: i.id,
          resultado: i.resultado,
          puntaje: i.puntaje,
          intento: i.estado === "verificado" ? intento : null,
        },
      };
    }),
    log: vi.fn(),
    ...over,
  } as WebhookDeps;
  return deps;
}

const body = (r: Response) => r.json() as Promise<Record<string, unknown>>;

describe("handleChallengeResult", () => {
  it("records a valid, fully matching submission", async () => {
    const deps = makeDeps();
    const res = await handleChallengeResult(signed(payload()), deps);
    expect(res.status).toBe(201);
    expect(await body(res)).toMatchObject({
      resultado: "aprobado",
      puntaje: 100,
      url: "http://localhost:3100/retos/reto-1-1-login",
    });
    const fin = vi.mocked(deps.finalize).mock.calls[0]![0];
    expect(fin.estado).toBe("verificado");
    expect(fin.detalle.criterios).toMatchObject([
      { titulo: "La suite se ejecuta" },
      { feedback_fallo: "La suite no detecta el defecto" },
    ]);
  });

  it("recalculates the level of the student after finalizing", async () => {
    const recalculateLevel = vi.fn(async () => null);
    const deps = makeDeps({ recalculateLevel });
    const res = await handleChallengeResult(signed(payload()), deps);
    expect(res.status).toBe(201);
    expect(recalculateLevel).toHaveBeenCalledWith(link.user_id);
    const finalizeOrder = vi.mocked(deps.finalize).mock.invocationCallOrder[0]!;
    expect(recalculateLevel.mock.invocationCallOrder[0]!).toBeGreaterThan(finalizeOrder);
  });

  it("keeps the verified submission when the level recalculation fails", async () => {
    const recalculateLevel = vi.fn(async () => {
      throw new Error("rules exploded");
    });
    const deps = makeDeps({ recalculateLevel });
    const onVerified = vi.fn();
    deps.onVerified = onVerified;
    const res = await handleChallengeResult(signed(payload()), deps);
    expect(res.status).toBe(201);
    expect(await body(res)).toMatchObject({ resultado: "aprobado" });
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "level_recalculation_failed",
        user_id: link.user_id,
        message: "rules exploded",
      }),
    );
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it("recalculates again when the run was already recorded (repairs a failed recalculation)", async () => {
    const recalculateLevel = vi.fn(async () => null);
    const deps = makeDeps({ recalculateLevel });
    deps.finalize = vi.fn(async (i) => ({
      updated: false,
      submission: { id: i.id, resultado: "aprobado", puntaje: 100, intento: 1 },
    }));
    const res = await handleChallengeResult(signed(payload()), deps);
    expect(res.status).toBe(200);
    expect(recalculateLevel).toHaveBeenCalledWith(link.user_id);
  });

  it("computes the score on the server and fails below the threshold", async () => {
    const p = payload({
      criteria: [
        { id: "suite-ejecuta", status: "pass", evidence: "" },
        { id: "detecta-fase1-login", status: "fail", evidence: "0/4" },
      ],
    });
    const res = await handleChallengeResult(signed(p), makeDeps());
    expect(await body(res)).toMatchObject({ resultado: "reprobado", puntaje: 30 });
  });

  it("rejects a tampered body, another student's key and an old key version with a generic 401", async () => {
    for (const opts of [{ tamper: true }, { keyVersion: 2 }]) {
      const res = await handleChallengeResult(signed(payload(), opts), makeDeps());
      expect(res.status).toBe(401);
      expect(await body(res)).toEqual({ error: "unauthorized" });
    }
    const other = new Request("http://localhost/x", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-course-key-id": KEY_ID,
        "x-course-timestamp": String(NOW_MS / 1000),
        "x-course-nonce": "pX0v6l2nRk5a7wq1Zb9cYg",
        "x-course-signature": computeSignature(
          deriveChallengeKey(MASTER, "ck_otherstudent00000000a", 1),
          String(NOW_MS / 1000),
          "pX0v6l2nRk5a7wq1Zb9cYg",
          JSON.stringify(payload()),
        ),
      },
      body: JSON.stringify(payload()),
    });
    expect((await handleChallengeResult(other, makeDeps())).status).toBe(401);
  });

  it("answers 401 for a revoked or unknown key without touching the reservation", async () => {
    for (const l of [null, { ...link, revoked_at: "2026-01-01T00:00:00Z" }]) {
      const deps = makeDeps({ link: l });
      expect((await handleChallengeResult(signed(payload()), deps)).status).toBe(401);
      expect(deps.reserve).not.toHaveBeenCalled();
    }
  });

  it("rejects timestamps outside the window before any database call", async () => {
    for (const offset of [-301, 301]) {
      const deps = makeDeps();
      const res = await handleChallengeResult(signed(payload({}, NOW_MS / 1000 + offset)), deps);
      expect(res.status).toBe(401);
      expect(deps.gate).not.toHaveBeenCalled();
    }
  });

  it("rejects a replayed nonce with 409", async () => {
    const deps = makeDeps();
    expect((await handleChallengeResult(signed(payload()), deps)).status).toBe(201);
    expect((await handleChallengeResult(signed(payload()), deps)).status).toBe(409);
  });

  it("answers 200 already_recorded for a finished run sent again with a new nonce", async () => {
    const deps = makeDeps();
    await handleChallengeResult(signed(payload()), deps);
    const res = await handleChallengeResult(
      signed(payload({}, NOW_MS / 1000, "second-nonce-0123456789ab")),
      deps,
    );
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ status: "already_recorded", resultado: "aprobado" });
  });

  it("maps each platform mismatch to its code", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ exercise: "reto-otro" }, "exercise_mismatch"],
      [{ repo: { id: 1, full_name: "alumna/reto-1-1-login" } }, "repo_mismatch"],
      [{ evaluator: { version: "9.9.9", sha: EVALUATOR_SHA } }, "evaluator_not_allowed"],
      [{ arena: { ...payload().arena, scenario: "otro" } }, "arena_mismatch"],
      [{ arena: { ...payload().arena, rng_seed: 7 } }, "arena_mismatch"],
      [{ criteria: [{ id: "suite-ejecuta", status: "pass", evidence: "" }] }, "criteria_mismatch"],
      [
        { criteria: [...payload().criteria, { id: "extra", status: "pass", evidence: "" }] },
        "criteria_mismatch",
      ],
    ];
    for (const [over, code] of cases) {
      const res = await handleChallengeResult(signed(payload(over)), makeDeps());
      expect([res.status, (await body(res)).error]).toEqual([422, code]);
    }
  });

  it("rejects guided exercises and unpublished lessons", async () => {
    for (const l of [
      { ...link, exercise_tipo: "guiado" },
      { ...link, lesson_estado: "borrador" },
    ]) {
      const res = await handleChallengeResult(signed(payload()), makeDeps({ link: l }));
      expect((await body(res)).error).toBe("exercise_mismatch");
    }
  });

  it("rejects extra fields and a score sent by the caller with 400", async () => {
    for (const extra of [{ user_id: "x" }, { score: 100 }, { aprobado: true }]) {
      const res = await handleChallengeResult(signed(payload(extra)), makeDeps());
      expect([res.status, (await body(res)).error]).toEqual([400, "invalid_payload"]);
    }
  });

  it("rejects broken JSON after a valid signature and a body that disagrees with the headers", async () => {
    const broken = await handleChallengeResult(
      signed("{not json", { nonce: "pX0v6l2nRk5a7wq1Zb9cYg" }),
      makeDeps(),
    );
    expect([broken.status, (await body(broken)).error]).toEqual([400, "invalid_payload"]);
    const res = await handleChallengeResult(
      signed(payload({ nonce: "different-nonce-0123456789" }), { nonce: "pX0v6l2nRk5a7wq1Zb9cYg" }),
      makeDeps(),
    );
    expect(res.status).toBe(400);
  });

  it("enforces method, content type and body size", async () => {
    const get = new Request("http://localhost/x", { method: "GET" });
    expect((await handleChallengeResult(get, makeDeps())).status).toBe(405);
    const text = signed(payload(), { headers: { "content-type": "text/plain" } });
    expect((await handleChallengeResult(text, makeDeps())).status).toBe(415);
    const big = signed(payload(), { headers: { "content-length": "70000" } });
    expect((await handleChallengeResult(big, makeDeps())).status).toBe(413);
    // No content-length: the stream is cut at the limit.
    const huge = signed("x".repeat(65 * 1024));
    huge.headers.delete("content-length");
    expect((await handleChallengeResult(huge, makeDeps())).status).toBe(413);
  });

  it("answers 429 when the IP bucket is exhausted, before checking the signature", async () => {
    const deps = makeDeps({ gate: vi.fn(async () => ({ limited: true, link: null })) });
    const res = await handleChallengeResult(signed(payload(), { tamper: true }), deps);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
  });

  it("marks the run as rejected when GitHub does not confirm it", async () => {
    const deps = makeDeps({
      verify: async () => ({ ok: false, kind: "rejected", reason: "fork" }),
    });
    const res = await handleChallengeResult(signed(payload()), deps);
    expect([res.status, (await body(res)).error]).toEqual([422, "run_not_verified"]);
    expect(vi.mocked(deps.finalize).mock.calls[0]![0]).toMatchObject({
      estado: "rechazado",
      verificacion: { reason: "fork" },
    });
  });

  it("answers 503 with Retry-After when GitHub is unavailable, and a retry resumes the same row", async () => {
    let down = true;
    const deps = makeDeps({
      verify: async () =>
        down
          ? { ok: false, kind: "unavailable", retryAfterSeconds: 42 }
          : { ok: true, snapshot: {} },
    });
    const first = await handleChallengeResult(signed(payload()), deps);
    expect([first.status, first.headers.get("retry-after")]).toEqual([503, "42"]);
    down = false;
    const retry = await handleChallengeResult(
      signed(payload({}, NOW_MS / 1000, "retry-nonce-0123456789abc")),
      deps,
    );
    expect(retry.status).toBe(201);
    const [a, b] = vi.mocked(deps.finalize).mock.calls.map((c) => c[0].id);
    expect(a).toBe(b);
  });

  it("maps the reservation limits to 429 and 503", async () => {
    const limit = makeDeps({
      reserve: vi.fn(async () => ({ status: "limit" as const, retry_after: 1800 })),
    });
    const r1 = await handleChallengeResult(signed(payload()), limit);
    expect([r1.status, r1.headers.get("retry-after")]).toEqual([429, "1800"]);
    const global = makeDeps({
      reserve: vi.fn(async () => ({ status: "limit_global" as const, retry_after: 90 })),
    });
    expect((await handleChallengeResult(signed(payload()), global)).status).toBe(503);
  });

  it("does not log the body, the signature or the key", async () => {
    const deps = makeDeps();
    await handleChallengeResult(signed(payload()), deps);
    const logged = JSON.stringify(vi.mocked(deps.log).mock.calls);
    expect(logged).not.toContain("x-course");
    expect(logged).not.toContain("v1=");
  });
});

describe("clientIp", () => {
  it("uses x-vercel-forwarded-for, then x-real-ip, then local; takes the first of a list", () => {
    expect(
      clientIp(
        new Headers({ "x-vercel-forwarded-for": "1.1.1.1, 2.2.2.2", "x-real-ip": "3.3.3.3" }),
      ),
    ).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9" }))).toBe("local");
  });
});
