import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  challengeCriteriaSchema,
  challengeHeadersSchema,
  challengeResultPayloadSchema,
  computeSignature,
  deriveChallengeKey,
  formatChallengeKey,
  parseChallengeKey,
  scoreSubmission,
  signingString,
  verifySignature,
  type ChallengeCriteria,
} from "./challenge-result";

const MASTER = "0123456789abcdef0123456789abcdef";
const KEY_ID = "ck_AAAAAAAAAAAAAAAAAAAAAA";
const NONCE = "pX0v6l2nRk5a7wq1Zb9cYg";
const KEY_HEX = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0")).join("");
const KEY = Buffer.from(KEY_HEX, "hex");

describe("deriveChallengeKey", () => {
  it("matches an independent HMAC-SHA256 vector (openssl)", () => {
    // echo -n "course-challenge-key/v1|ck_AAAAAAAAAAAAAAAAAAAAAA|1" | openssl dgst -sha256 -hmac $MASTER
    expect(deriveChallengeKey(MASTER, KEY_ID, 1).toString("hex")).toBe(
      "586b462dc9109d888b949d87ef369cf919947904653599b60d68c43d4cfaba9d",
    );
  });

  it("changes with key id, key version and master secret", () => {
    const base = deriveChallengeKey(MASTER, KEY_ID, 1).toString("hex");
    expect(deriveChallengeKey(MASTER, KEY_ID, 2).toString("hex")).not.toBe(base);
    expect(deriveChallengeKey(MASTER, "ck_BAAAAAAAAAAAAAAAAAAAAA", 1).toString("hex")).not.toBe(
      base,
    );
    expect(deriveChallengeKey(MASTER + "x", KEY_ID, 1).toString("hex")).not.toBe(base);
  });

  it("round-trips the student-facing format", () => {
    const shown = formatChallengeKey(KEY);
    expect(shown).toMatch(/^cck_[A-Za-z0-9_-]{43}$/);
    expect(parseChallengeKey(shown)?.equals(KEY)).toBe(true);
    expect(parseChallengeKey(shown.slice(1))).toBeNull();
    expect(parseChallengeKey("xxx_" + shown.slice(4))).toBeNull();
  });
});

describe("signature", () => {
  const ts = "1793980800";
  const body = '{"a":1}';

  it("builds the signing string from the raw bytes", () => {
    expect(signingString(ts, NONCE, body).toString("utf8")).toBe(`v1.${ts}.${NONCE}.${body}`);
    expect(signingString(ts, NONCE, Buffer.from(body)).equals(signingString(ts, NONCE, body))).toBe(
      true,
    );
  });

  it("matches an independent HMAC-SHA256 vector (openssl, hexkey)", () => {
    expect(computeSignature(KEY, ts, NONCE, body)).toBe(
      "v1=65e65e813984d690b19dcd9b0c7eccc46f5f8bb7bde4a97b441fc4b9254840bb",
    );
  });

  it("is deterministic and sensitive to every input", () => {
    const sig = computeSignature(KEY, ts, NONCE, body);
    expect(computeSignature(KEY, ts, NONCE, body)).toBe(sig);
    expect(computeSignature(KEY, ts, NONCE, '{"a":2}')).not.toBe(sig);
    expect(computeSignature(KEY, ts, NONCE, '{"a":1} ')).not.toBe(sig);
    expect(computeSignature(KEY, "1793980801", NONCE, body)).not.toBe(sig);
    expect(computeSignature(KEY, ts, NONCE.replace("p", "q"), body)).not.toBe(sig);
    expect(computeSignature(Buffer.alloc(32, 1), ts, NONCE, body)).not.toBe(sig);
  });

  it("verifies only the exact signature and never throws on malformed ones", () => {
    const sig = computeSignature(KEY, ts, NONCE, body);
    expect(verifySignature(sig, KEY, ts, NONCE, body)).toBe(true);
    expect(verifySignature(sig, KEY, ts, NONCE, '{"a":2}')).toBe(false);
    const flipped = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
    expect(verifySignature(flipped, KEY, ts, NONCE, body)).toBe(false);
    expect(verifySignature(sig.toUpperCase(), KEY, ts, NONCE, body)).toBe(false);
    expect(verifySignature("v1=abc", KEY, ts, NONCE, body)).toBe(false);
    expect(verifySignature("", KEY, ts, NONCE, body)).toBe(false);
  });
});

describe("challengeHeadersSchema", () => {
  const ok = {
    "x-course-key-id": KEY_ID,
    "x-course-timestamp": "1793980800",
    "x-course-nonce": NONCE,
    "x-course-signature": "v1=" + "a".repeat(64),
  };

  it("accepts valid headers", () => {
    expect(challengeHeadersSchema.safeParse(ok).success).toBe(true);
  });

  it.each([
    ["x-course-key-id", "ck_short"],
    ["x-course-timestamp", "179398080"],
    ["x-course-timestamp", "1793980800.5"],
    ["x-course-nonce", "short"],
    ["x-course-nonce", "a".repeat(65)],
    ["x-course-signature", "v1=" + "A".repeat(64)],
    ["x-course-signature", "v2=" + "a".repeat(64)],
  ])("rejects %s = %s", (key, value) => {
    expect(challengeHeadersSchema.safeParse({ ...ok, [key]: value }).success).toBe(false);
  });
});

const payload = () => ({
  schema: "challenge-result/v1",
  key_id: "ck_3q2-7wEXAMPLE0000000aa",
  timestamp: 1793980800,
  nonce: NONCE,
  exercise: "reto-1-1-login",
  repo: { id: 912345678, full_name: "alumna/reto-1-1-login" },
  run: {
    id: 18234567890,
    attempt: 1,
    commit_sha: "4f1c0e5b9a7d3c2e1f0a9b8c7d6e5f4a3b2c1d0e",
    event: "push",
  },
  evaluator: { version: "1.0.0", sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678" },
  arena: {
    image_digest: "sha256:" + "a".repeat(64),
    seed_version: "arena-seed-2",
    scenario: "fase1-login",
    release: null,
    rng_seed: 1046,
  },
  criteria: [
    { id: "suite-ejecuta", status: "pass", evidence: "4 tests encontrados" },
    { id: "detecta-fase1-login", status: "fail", evidence: "0/4 fallan" },
  ],
  summary: { duration_ms: 81234, tests_total: 4 },
});

describe("challengeResultPayloadSchema", () => {
  const parse = (p: unknown) => challengeResultPayloadSchema.safeParse(p).success;

  it("accepts the design example, with and without summary", () => {
    expect(parse(payload())).toBe(true);
    const rest: Record<string, unknown> = payload();
    delete rest.summary;
    expect(parse(rest)).toBe(true);
  });

  it.each([
    "schema",
    "key_id",
    "timestamp",
    "nonce",
    "exercise",
    "repo",
    "run",
    "evaluator",
    "arena",
    "criteria",
  ])("requires %s", (field) => {
    const p: Record<string, unknown> = payload();
    delete p[field];
    expect(parse(p)).toBe(false);
  });

  it("rejects unknown and forbidden fields (score, user_id, nested extras)", () => {
    expect(parse({ ...payload(), score: 100 })).toBe(false);
    expect(parse({ ...payload(), aprobado: true })).toBe(false);
    expect(parse({ ...payload(), user_id: "x" })).toBe(false);
    expect(parse({ ...payload(), repo: { ...payload().repo, owner: "x" } })).toBe(false);
  });

  it("rejects malformed ids and values", () => {
    expect(parse({ ...payload(), key_id: "ck_short" })).toBe(false);
    expect(parse({ ...payload(), key_id: "xx_3q2-7wEXAMPLE0000000a" })).toBe(false);
    expect(parse({ ...payload(), schema: "challenge-result/v2" })).toBe(false);
    expect(parse({ ...payload(), exercise: "Reto Login" })).toBe(false);
    expect(parse({ ...payload(), timestamp: 17939808 })).toBe(false);
    expect(parse({ ...payload(), repo: { id: 0, full_name: "a/b" } })).toBe(false);
    expect(parse({ ...payload(), repo: { id: 1, full_name: "sin-barra" } })).toBe(false);
    expect(parse({ ...payload(), run: { ...payload().run, attempt: 101 } })).toBe(false);
    expect(parse({ ...payload(), run: { ...payload().run, commit_sha: "ABC" } })).toBe(false);
    expect(parse({ ...payload(), run: { ...payload().run, event: "schedule" } })).toBe(false);
    expect(parse({ ...payload(), evaluator: { version: "1.0", sha: "a".repeat(40) } })).toBe(false);
    expect(parse({ ...payload(), arena: { ...payload().arena, image_digest: "sha256:abc" } })).toBe(
      false,
    );
    expect(parse({ ...payload(), arena: { ...payload().arena, rng_seed: -1 } })).toBe(false);
  });

  it("enforces size limits", () => {
    const fullName = "a".repeat(30) + "/" + "b".repeat(110);
    expect(parse({ ...payload(), repo: { id: 1, full_name: fullName } })).toBe(false);
    const crit = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `c-${i}`, status: "pass", evidence: "" }));
    expect(parse({ ...payload(), criteria: crit(50) })).toBe(true);
    expect(parse({ ...payload(), criteria: crit(51) })).toBe(false);
    expect(parse({ ...payload(), criteria: [] })).toBe(false);
    const long = [{ id: "a", status: "pass", evidence: "x".repeat(501) }];
    expect(parse({ ...payload(), criteria: long })).toBe(false);
    const ok = [{ id: "a", status: "pass", evidence: "x".repeat(500) }];
    expect(parse({ ...payload(), criteria: ok })).toBe(true);
    expect(parse({ ...payload(), arena: { ...payload().arena, scenario: "s".repeat(65) } })).toBe(
      false,
    );
  });

  it("rejects bad statuses and duplicate criterion ids", () => {
    const c = { id: "a", status: "pass", evidence: "" };
    expect(parse({ ...payload(), criteria: [{ ...c, status: "ok" }] })).toBe(false);
    expect(parse({ ...payload(), criteria: [c, c] })).toBe(false);
  });
});

const criteria = (over: Record<string, unknown> = {}) => ({
  version: 1,
  arena: { escenario: "fase1-login", release: null, semilla: 1046 },
  umbral: 70,
  obligatorios: ["suite-verde-baseline"],
  criterios: [
    {
      id: "suite-ejecuta",
      titulo: "Al menos 3 tests",
      tipo: "suite_ejecuta",
      min: 3,
      peso: 10,
      competencia: "tecnica",
      feedback_fallo: "Escribe más tests.",
    },
    {
      id: "suite-verde-baseline",
      titulo: "Verde en baseline",
      tipo: "suite_pasa",
      escenario: "baseline",
      peso: 30,
      competencia: "tecnica",
      feedback_fallo: "Un test que falla en baseline no es fiable.",
    },
    {
      id: "detecta-fase1-login",
      titulo: "Detecta el defecto",
      tipo: "suite_detecta",
      escenario: "fase1-login",
      peso: 50,
      competencia: "analisis",
      feedback_fallo: "Prueba variantes del correo.",
    },
    {
      id: "sin-arena-interna",
      titulo: "Sin endpoints internos",
      tipo: "estatico",
      regla: "sin-arena-interna",
      peso: 0,
      competencia: "autonomia",
      feedback_fallo: "No uses /__arena.",
    },
    {
      id: "sin-esperas-fijas",
      titulo: "Sin esperas fijas",
      tipo: "estatico",
      regla: "sin-esperas-fijas",
      peso: 10,
      competencia: "tecnica",
      feedback_fallo: "Evita waitForTimeout.",
    },
  ],
  ...over,
});

describe("challengeCriteriaSchema", () => {
  const parse = (c: unknown) => challengeCriteriaSchema.safeParse(c);
  const withCriterion = (patch: Record<string, unknown>, i = 0) => {
    const c = criteria();
    c.criterios[i] = { ...c.criterios[i], ...patch } as (typeof c.criterios)[number];
    return c;
  };

  it("accepts a valid challenge and applies defaults", () => {
    const r = parse(criteria());
    expect(r.success).toBe(true);
    const noMandatory: Record<string, unknown> = criteria();
    delete noMandatory.obligatorios;
    const r2 = parse(noMandatory);
    expect(r2.success && r2.data.obligatorios).toEqual([]);
    const detecta = parse(criteria());
    expect(detecta.success && detecta.data.criterios[2]).toMatchObject({ release: null });
  });

  it.each([
    ["wrong version", criteria({ version: 2 })],
    ["umbral above 100", criteria({ umbral: 101 })],
    ["fractional umbral", criteria({ umbral: 70.5 })],
    ["negative semilla", criteria({ arena: { escenario: "x", release: null, semilla: -1 } })],
    ["no criteria", criteria({ criterios: [] })],
    ["unknown top-level key", criteria({ extra: 1 })],
    ["unknown mandatory id", criteria({ obligatorios: ["nope"] })],
    ["duplicate mandatory id", criteria({ obligatorios: ["suite-ejecuta", "suite-ejecuta"] })],
    ["unknown tipo", withCriterion({ tipo: "otro" })],
    ["min 0", withCriterion({ min: 0 })],
    ["weight above 100", withCriterion({ peso: 101 })],
    ["negative weight", withCriterion({ peso: -1 })],
    ["unknown competency", withCriterion({ competencia: "velocidad" })],
    ["empty feedback", withCriterion({ feedback_fallo: " " })],
    ["unknown static rule", withCriterion({ regla: "otra" }, 3)],
    ["extra key in a criterion", withCriterion({ regla: "sin-only" }, 0)],
    ["duplicate criterion ids", withCriterion({ id: "suite-verde-baseline" }, 0)],
  ])("rejects %s", (_name, input) => {
    expect(parse(input).success).toBe(false);
  });

  it("rejects more than 50 criteria and all-zero weights", () => {
    const many = Array.from({ length: 51 }, (_, i) => ({
      ...criteria().criterios[0],
      id: `c-${i}`,
    }));
    expect(parse(criteria({ criterios: many, obligatorios: [] })).success).toBe(false);
    const zero = criteria().criterios.map((k) => ({ ...k, peso: 0 }));
    expect(parse(criteria({ criterios: zero })).success).toBe(false);
  });
});

describe("scoreSubmission", () => {
  const spec = challengeCriteriaSchema.parse(criteria()) as ChallengeCriteria;
  const all = (status: "pass" | "fail" | "error", over: Record<string, string> = {}) =>
    spec.criterios.map((k) => ({
      id: k.id,
      status: (over[k.id] ?? status) as "pass" | "fail" | "error",
    }));

  it("scores 100 and approves when everything passes", () => {
    expect(scoreSubmission(spec, all("pass"))).toEqual({
      resultado: "aprobado",
      puntaje: 100,
      competencias: { tecnica: 100, analisis: 100 },
    });
  });

  it("weights criteria and computes the percentage with two decimals", () => {
    // pass: 10 + 30 + 10 of 100; fail: detecta (50)
    const r = scoreSubmission(spec, all("pass", { "detecta-fase1-login": "fail" }));
    expect(r.puntaje).toBe(50);
    expect(r.resultado).toBe("reprobado");
    const three = challengeCriteriaSchema.parse(
      criteria({
        obligatorios: [],
        criterios: criteria()
          .criterios.slice(0, 3)
          .map((k, i) => ({ ...k, peso: [1, 1, 1][i] })),
      }),
    );
    const s = scoreSubmission(three, [
      { id: "suite-ejecuta", status: "pass" },
      { id: "suite-verde-baseline", status: "fail" },
      { id: "detecta-fase1-login", status: "fail" },
    ]);
    expect(s.puntaje).toBe(33.33);
  });

  it("passes at exactly the threshold and fails just below", () => {
    // fail only suite-ejecuta (10) and sin-esperas-fijas (10): 80
    expect(
      scoreSubmission(spec, all("pass", { "suite-ejecuta": "fail", "sin-esperas-fijas": "fail" })),
    ).toMatchObject({ puntaje: 80, resultado: "aprobado" });
    const edge = challengeCriteriaSchema.parse(criteria({ umbral: 80 }));
    expect(
      scoreSubmission(edge, all("pass", { "suite-ejecuta": "fail", "sin-esperas-fijas": "fail" }))
        .resultado,
    ).toBe("aprobado");
    const above = challengeCriteriaSchema.parse(criteria({ umbral: 81 }));
    expect(
      scoreSubmission(above, all("pass", { "suite-ejecuta": "fail", "sin-esperas-fijas": "fail" }))
        .resultado,
    ).toBe("reprobado");
  });

  it("fails when a mandatory criterion fails even with a high score", () => {
    const r = scoreSubmission(spec, all("pass", { "suite-verde-baseline": "fail" }));
    expect(r.puntaje).toBe(70);
    expect(r.resultado).toBe("reprobado");
  });

  it("keeps a zero-weight mandatory criterion binding", () => {
    const withMandatory = challengeCriteriaSchema.parse(
      criteria({ obligatorios: ["sin-arena-interna"] }),
    );
    const r = scoreSubmission(withMandatory, all("pass", { "sin-arena-interna": "fail" }));
    expect(r.puntaje).toBe(100);
    expect(r.resultado).toBe("reprobado");
  });

  it("returns error without a score when any criterion errors, even if others fail", () => {
    const r = scoreSubmission(spec, all("fail", { "detecta-fase1-login": "error" }));
    expect(r).toEqual({ resultado: "error", puntaje: null, competencias: {} });
  });

  it("computes the score per competency, skipping competencies with no weight", () => {
    const r = scoreSubmission(
      spec,
      all("pass", { "suite-ejecuta": "fail", "detecta-fase1-login": "fail" }),
    );
    // tecnica: pass 30+10 of 50 = 80; analisis: 0 of 50; autonomia weight 0 -> omitted
    expect(r.competencias).toEqual({ tecnica: 80, analisis: 0 });
  });

  it("is independent of the order of the results", () => {
    const results = all("pass", { "detecta-fase1-login": "fail" });
    expect(scoreSubmission(spec, [...results].reverse())).toEqual(scoreSubmission(spec, results));
  });

  it("throws when results do not match the criteria", () => {
    expect(() => scoreSubmission(spec, all("pass").slice(1))).toThrow();
    expect(() =>
      scoreSubmission(spec, [...all("pass").slice(1), { id: "otro", status: "pass" }]),
    ).toThrow();
    expect(() => scoreSubmission(spec, [...all("pass"), all("pass")[0]!])).toThrow();
  });
});

describe("challengeCriteriaSchema (phase 2 extensions)", () => {
  const parse = (c: unknown) => challengeCriteriaSchema.safeParse(c);
  const base = {
    peso: 10,
    competencia: "tecnica",
    feedback_fallo: "Revisa el criterio.",
  };
  const withExtra = (...extra: Record<string, unknown>[]) => {
    const c = criteria();
    c.criterios.push(
      ...(extra.map((e, i) => ({ id: `extra-${i}`, titulo: "Extra", ...base, ...e })) as never[]),
    );
    return c;
  };

  it.each([
    ["pom rule", { tipo: "estatico", regla: "pom-clases-de-pagina" }],
    ["ci rule", { tipo: "estatico", regla: "ci-rama-protegida" }],
    ["docker rule", { tipo: "estatico", regla: "compose-seguro" }],
    ["credentials rule", { tipo: "estatico", regla: "sin-credenciales-en-codigo" }],
    [
      "suite_pasa with release and grep",
      {
        tipo: "suite_pasa",
        escenario: "fase2-api",
        release: "v2",
        grep: "@humo",
      },
    ],
    [
      "suite_detecta with grep",
      {
        tipo: "suite_detecta",
        escenario: "eval-2-3-estado",
        grep: "@api-estado",
      },
    ],
    ["reporte_titulos", { tipo: "reporte_titulos", titulos: ["Inicia sesión"] }],
    ["reporte_requisitos", { tipo: "reporte_requisitos", requisitos: ["REQ-1", "REQ-22"], min: 2 }],
    ["reporte_etiquetas", { tipo: "reporte_etiquetas", etiqueta: "humo", min: 1 }],
    [
      "informe",
      {
        tipo: "informe",
        formato: "defectos-v1",
        archivo: "informes/defectos.yaml",
        min: 3,
      },
    ],
    [
      "docker_compose",
      {
        tipo: "docker_compose",
        archivo: "compose.yml",
        servicio: "tests",
        informe: "results/report.json",
        min_pasan: 3,
      },
    ],
  ])("accepts %s", (_n, extra) => {
    expect(parse(withExtra(extra)).success).toBe(true);
  });

  it("keeps suite_detecta release default and leaves suite_pasa untouched", () => {
    const r = parse(criteria());
    expect(r.success && r.data.criterios[1]).not.toHaveProperty("release");
    expect(r.success && r.data.criterios[1]).not.toHaveProperty("grep");
    expect(r.success && r.data.criterios[2]).not.toHaveProperty("grep");
  });

  it.each([
    ["unknown rule", { tipo: "estatico", regla: "inventada" }],
    ["grep without @", { tipo: "suite_pasa", escenario: "baseline", grep: "humo" }],
    ["grep with two tags", { tipo: "suite_pasa", escenario: "baseline", grep: "@a|@b" }],
    ["grep with shell chars", { tipo: "suite_detecta", escenario: "x", grep: "@a;rm" }],
    ["grep too long", { tipo: "suite_detecta", escenario: "x", grep: `@${"a".repeat(31)}` }],
    ["empty titulos", { tipo: "reporte_titulos", titulos: [] }],
    ["blank titulo", { tipo: "reporte_titulos", titulos: [" "] }],
    ["bad requisito", { tipo: "reporte_requisitos", requisitos: ["req-1"], min: 1 }],
    ["requisitos min 0", { tipo: "reporte_requisitos", requisitos: ["REQ-1"], min: 0 }],
    ["etiqueta with @", { tipo: "reporte_etiquetas", etiqueta: "@humo", min: 1 }],
    ["informe bad formato", { tipo: "informe", formato: "otro", archivo: "a.yaml", min: 1 }],
    [
      "informe absolute path",
      { tipo: "informe", formato: "defectos-v1", archivo: "/a.yaml", min: 1 },
    ],
    [
      "informe path traversal",
      { tipo: "informe", formato: "defectos-v1", archivo: "../a.yaml", min: 1 },
    ],
    [
      "docker_compose min_pasan 0",
      {
        tipo: "docker_compose",
        archivo: "compose.yml",
        servicio: "t",
        informe: "r.json",
        min_pasan: 0,
      },
    ],
    [
      "docker_compose bad servicio",
      {
        tipo: "docker_compose",
        archivo: "compose.yml",
        servicio: "T T",
        informe: "r.json",
        min_pasan: 1,
      },
    ],
    [
      "docker_compose extra key",
      {
        tipo: "docker_compose",
        archivo: "compose.yml",
        servicio: "t",
        informe: "r.json",
        min_pasan: 1,
        min: 1,
      },
    ],
  ])("rejects %s", (_n, extra) => {
    expect(parse(withExtra(extra)).success).toBe(false);
  });

  it("allows at most one docker_compose criterion", () => {
    const dc = {
      tipo: "docker_compose",
      archivo: "compose.yml",
      servicio: "tests",
      informe: "results/report.json",
      min_pasan: 1,
    };
    expect(parse(withExtra(dc)).success).toBe(true);
    expect(parse(withExtra(dc, dc)).success).toBe(false);
  });

  it("parses and re-serializes reto-1-1-login.json identically", () => {
    const raw = readFileSync(
      new URL("../../../evaluator/retos/reto-1-1-login.json", import.meta.url),
      "utf8",
    );
    const r = parse(JSON.parse(raw));
    expect(r.success).toBe(true);
    if (r.success) expect(`${JSON.stringify(r.data, null, 2)}\n`).toBe(raw);
  });
});
