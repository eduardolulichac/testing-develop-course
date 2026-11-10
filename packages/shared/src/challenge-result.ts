import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Contract between the challenge evaluator (GitHub Actions) and the platform webhook.
// Design: docs/EVALUACION_DISENO.md sections 4 (payload and signature) and 6 (scoring).

// Same shape as SLUG_ID_REGEX in content-schema.ts (copied: content-schema imports this file).
const SLUG_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const slug = z.string().regex(SLUG_ID_REGEX, "Id inválido");
const nonEmpty = z.string().trim().min(1);

/** Scoring competencies (same values as the `competencia` check in the initial migration). */
export const COMPETENCIES = [
  "tecnica",
  "analisis",
  "criterio_ia",
  "comunicacion",
  "autonomia",
] as const;
export type Competency = (typeof COMPETENCIES)[number];

export const CRITERION_STATUSES = ["pass", "fail", "error"] as const;
export type CriterionStatus = (typeof CRITERION_STATUSES)[number];

/** Maximum raw body size accepted by the webhook (64 KiB). */
export const MAX_BODY_BYTES = 65_536;
/** Allowed clock skew between the timestamp header and the server clock, in seconds. */
export const TIMESTAMP_WINDOW_SECONDS = 300;
export const SIGNATURE_VERSION = "v1";
export const PAYLOAD_SCHEMA_VERSION = "challenge-result/v1";

// --- Headers and payload ------------------------------------------------------------------

export const KEY_ID_REGEX = /^ck_[A-Za-z0-9_-]{22}$/;
export const TIMESTAMP_REGEX = /^\d{10}$/;
export const NONCE_REGEX = /^[A-Za-z0-9_-]{22,64}$/;
export const SIGNATURE_REGEX = /^v1=[0-9a-f]{64}$/;

export const keyIdSchema = z.string().regex(KEY_ID_REGEX, "key_id inválido");
export const nonceSchema = z.string().regex(NONCE_REGEX, "nonce inválido");

/** The four `X-Course-*` headers, already lower-cased by the caller or not: keys are exact. */
export const challengeHeadersSchema = z.strictObject({
  "x-course-key-id": keyIdSchema,
  "x-course-timestamp": z.string().regex(TIMESTAMP_REGEX, "timestamp inválido"),
  "x-course-nonce": nonceSchema,
  "x-course-signature": z.string().regex(SIGNATURE_REGEX, "firma inválida"),
});

const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA40_REGEX = /^[0-9a-f]{40}$/;
const short = z.string().trim().min(1).max(64);

const payloadCriterionSchema = z.strictObject({
  id: slug,
  status: z.enum(CRITERION_STATUSES),
  evidence: z.string().max(500),
});

export const challengeResultPayloadSchema = z
  .strictObject({
    schema: z.literal(PAYLOAD_SCHEMA_VERSION),
    key_id: keyIdSchema,
    // Integer in the body (string in the header); the route compares them after parsing.
    timestamp: z.number().int().min(1_000_000_000).max(9_999_999_999),
    nonce: nonceSchema,
    exercise: slug,
    repo: z.strictObject({
      id: z.number().int().positive(),
      full_name: z
        .string()
        .max(140)
        .regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/, "full_name inválido"),
    }),
    run: z.strictObject({
      id: z.number().int().positive(),
      attempt: z.number().int().min(1).max(100),
      commit_sha: z.string().regex(SHA40_REGEX, "commit_sha inválido"),
      event: z.enum(["push", "workflow_dispatch"]),
    }),
    evaluator: z.strictObject({
      version: z.string().regex(SEMVER_REGEX, "Versión semver inválida"),
      sha: z.string().regex(SHA40_REGEX, "sha inválido"),
    }),
    arena: z.strictObject({
      image_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/, "image_digest inválido"),
      seed_version: short,
      scenario: short,
      release: short.nullable(),
      rng_seed: z.number().int().nonnegative(),
    }),
    criteria: z.array(payloadCriterionSchema).min(1).max(50),
    summary: z
      .strictObject({
        duration_ms: z.number().int().nonnegative().optional(),
        tests_total: z.number().int().nonnegative().optional(),
      })
      .optional(),
  })
  .superRefine((p, ctx) => {
    const ids = p.criteria.map((c) => c.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["criteria"], message: "Ids de criterio duplicados" });
    }
  });

export type ChallengeResultPayload = z.infer<typeof challengeResultPayloadSchema>;

// --- Signature ----------------------------------------------------------------------------

type Bytes = string | Uint8Array;

/**
 * Per-student signing key: HMAC-SHA256(master, "course-challenge-key/v1|key_id|key_version").
 * Returns the 32 raw bytes. A string master secret is used as its UTF-8 bytes (the design does
 * not say how the env var is decoded; the platform passes it exactly as stored).
 */
export function deriveChallengeKey(masterSecret: Bytes, keyId: string, keyVersion: number): Buffer {
  return createHmac("sha256", masterSecret)
    .update(`course-challenge-key/v1|${keyId}|${keyVersion}`)
    .digest();
}

/** Key shown to the student: "cck_" + base64url(32 bytes). */
export function formatChallengeKey(key: Uint8Array): string {
  return `cck_${Buffer.from(key).toString("base64url")}`;
}

/** Inverse of `formatChallengeKey`. Returns null if the prefix or the length is wrong. */
export function parseChallengeKey(shown: string): Buffer | null {
  if (!/^cck_[A-Za-z0-9_-]{43}$/.test(shown)) return null;
  const key = Buffer.from(shown.slice(4), "base64url");
  return key.length === 32 ? key : null;
}

/**
 * Signed bytes: "v1." + timestamp + "." + nonce + "." + raw body. No JSON canonicalization:
 * the raw body bytes are used as received. Header values are used as they arrive.
 */
export function signingString(timestamp: string, nonce: string, rawBody: Bytes): Buffer {
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : Buffer.from(rawBody);
  return Buffer.concat([Buffer.from(`${SIGNATURE_VERSION}.${timestamp}.${nonce}.`, "utf8"), body]);
}

/** Header value `v1=<hex>` for the given key and request. */
export function computeSignature(
  key: Uint8Array,
  timestamp: string,
  nonce: string,
  rawBody: Bytes,
): string {
  const mac = createHmac("sha256", key)
    .update(signingString(timestamp, nonce, rawBody))
    .digest("hex");
  return `${SIGNATURE_VERSION}=${mac}`;
}

/** Constant-time check of an `X-Course-Signature` value. A malformed value is just false. */
export function verifySignature(
  signatureHeader: string,
  key: Uint8Array,
  timestamp: string,
  nonce: string,
  rawBody: Bytes,
): boolean {
  if (!SIGNATURE_REGEX.test(signatureHeader)) return false;
  const expected = Buffer.from(computeSignature(key, timestamp, nonce, rawBody).slice(3), "hex");
  const received = Buffer.from(signatureHeader.slice(3), "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// --- Criteria (`criterio_aprobacion` of a `reto` exercise) ---------------------------------

const scenarioId = slug;

// Relative path inside the student's repo (no leading slash, no "..").
const relPath = z.string().regex(/^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]{1,120}$/, "Ruta inválida");
// A single tag, so the evaluator can pass it to the command line safely.
const tagGrep = z.string().regex(/^@[a-z0-9-]{1,30}$/, "Etiqueta inválida");

/** Closed list of static rules (each one is implemented and tested in evaluator/). */
export const STATIC_RULES = [
  "sin-esperas-fijas",
  "sin-arena-interna",
  "localizadores-por-rol",
  "sin-only",
  // POM and DRY
  "pom-specs-sin-localizadores",
  "pom-clases-de-pagina",
  "fixtures-personalizados",
  "sin-duplicacion",
  // Data
  "sin-credenciales-en-codigo",
  // CI
  "ci-dispara-en-pr",
  "ci-sin-pull-request-target",
  "ci-permisos-minimos",
  "ci-artefactos-siempre",
  "ci-secretos",
  "ci-humo-tras-despliegue",
  "ci-actionlint",
  "ci-rama-protegida",
  "ci-ejecucion-real",
  // Docker
  "docker-imagen-playwright-coincide",
  "docker-ignore",
  "compose-seguro",
] as const;
export type StaticRule = (typeof STATIC_RULES)[number];

const criterionBase = {
  id: slug,
  titulo: nonEmpty,
  peso: z.number().int().min(0).max(100),
  competencia: z.enum(COMPETENCIES),
  feedback_fallo: nonEmpty,
};

const criterionSchema = z.discriminatedUnion("tipo", [
  // The suite runs and has at least `min` tests.
  z.strictObject({
    ...criterionBase,
    tipo: z.literal("suite_ejecuta"),
    min: z.number().int().min(1),
  }),
  // Every test passes against the given scenario (usually baseline).
  // `release` and `grep` are optional WITHOUT default so existing retos serialize unchanged.
  z.strictObject({
    ...criterionBase,
    tipo: z.literal("suite_pasa"),
    escenario: scenarioId,
    release: z.string().optional(),
    grep: tagGrep.optional(),
  }),
  // Differential: passes on baseline AND at least one test fails on `escenario`.
  z.strictObject({
    ...criterionBase,
    tipo: z.literal("suite_detecta"),
    escenario: scenarioId,
    release: z.string().nullable().default(null),
    grep: tagGrep.optional(),
  }),
  // Static rule on the student's files (closed list of rules implemented in evaluator/).
  z.strictObject({
    ...criterionBase,
    tipo: z.literal("estatico"),
    regla: z.enum(STATIC_RULES),
  }),
  // Report criteria: evaluated on the baseline test list (titles, requirements, tags).
  z.strictObject({
    ...criterionBase,
    tipo: z.literal("reporte_titulos"),
    titulos: z.array(nonEmpty.max(200)).min(1).max(50),
  }),
  z.strictObject({
    ...criterionBase,
    tipo: z.literal("reporte_requisitos"),
    requisitos: z
      .array(z.string().regex(/^REQ-\d+$/, "Requisito inválido"))
      .min(1)
      .max(50),
    min: z.number().int().min(1),
  }),
  z.strictObject({
    ...criterionBase,
    tipo: z.literal("reporte_etiquetas"),
    etiqueta: z.string().regex(/^[a-z0-9-]{1,30}$/, "Etiqueta inválida"),
    min: z.number().int().min(1),
  }),
  // Structured report file written by the student (formats are owned by the evaluator).
  z.strictObject({
    ...criterionBase,
    tipo: z.literal("informe"),
    formato: z.enum(["defectos-v1", "registro-ia-v1"]),
    archivo: relPath,
    min: z.number().int().min(1),
  }),
  // Real `docker compose up` of the student's compose file; at most one per reto.
  z.strictObject({
    ...criterionBase,
    tipo: z.literal("docker_compose"),
    archivo: relPath,
    servicio: slug,
    informe: relPath,
    min_pasan: z.number().int().min(1),
  }),
]);

export const challengeCriteriaSchema = z
  .strictObject({
    version: z.literal(1),
    arena: z.strictObject({
      escenario: scenarioId,
      release: z.string().nullable(),
      semilla: z.number().int().nonnegative(),
    }),
    /** Minimum weighted score (0..100) to pass. */
    umbral: z.number().int().min(0).max(100),
    /** Criteria that must pass regardless of the score. */
    obligatorios: z.array(slug).default([]),
    criterios: z.array(criterionSchema).min(1).max(50),
  })
  .superRefine((c, ctx) => {
    const ids = c.criterios.map((k) => k.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["criterios"], message: "Ids de criterio duplicados" });
    }
    if (c.criterios.reduce((sum, k) => sum + k.peso, 0) <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["criterios"],
        message: "La suma de pesos debe ser > 0",
      });
    }
    if (c.criterios.filter((k) => k.tipo === "docker_compose").length > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["criterios"],
        message: "Como máximo un criterio docker_compose por reto",
      });
    }
    if (new Set(c.obligatorios).size !== c.obligatorios.length) {
      ctx.addIssue({ code: "custom", path: ["obligatorios"], message: "Obligatorios duplicados" });
    }
    for (const id of c.obligatorios) {
      if (!ids.includes(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["obligatorios"],
          message: `El obligatorio "${id}" no es un criterio definido`,
        });
      }
    }
  });

export type ChallengeCriteria = z.infer<typeof challengeCriteriaSchema>;

// --- Scoring ------------------------------------------------------------------------------

export type SubmissionOutcome = "aprobado" | "reprobado" | "error";

export interface SubmissionScore {
  resultado: SubmissionOutcome;
  /** 0..100 with two decimals; null when any criterion is in `error`. */
  puntaje: number | null;
  /** Score per competency with weight > 0; empty when `resultado` is "error". */
  competencias: Partial<Record<Competency, number>>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Server-side score from the status of each criterion (the payload never carries a score).
 * - Any `error` -> `resultado = "error"`, `puntaje = null` (environment fault: it does not
 *   penalize the student). Checked first, so it wins even over a missing mandatory criterion.
 * - Otherwise `puntaje = 100 * sum(weight of pass) / sum(weight)`, rounded to 2 decimals
 *   (the design says both "round" and "two decimals": two decimals is used).
 * - Approved when `puntaje >= umbral` and every mandatory criterion is `pass`.
 * - Per competency: same ratio over the criteria of that competency (weight > 0 only).
 * Throws if the results do not match the criteria exactly (the webhook rejects that earlier with 422).
 */
export function scoreSubmission(
  criteria: ChallengeCriteria,
  results: ReadonlyArray<{ id: string; status: CriterionStatus }>,
): SubmissionScore {
  const status = new Map<string, CriterionStatus>();
  for (const r of results) {
    if (status.has(r.id)) throw new Error(`Duplicate result for criterion "${r.id}"`);
    status.set(r.id, r.status);
  }
  if (
    status.size !== criteria.criterios.length ||
    criteria.criterios.some((k) => !status.has(k.id))
  ) {
    throw new Error("Results do not match the challenge criteria");
  }

  if ([...status.values()].includes("error")) {
    return { resultado: "error", puntaje: null, competencias: {} };
  }

  let total = 0;
  let passed = 0;
  const byCompetency = new Map<Competency, { total: number; passed: number }>();
  for (const k of criteria.criterios) {
    const ok = status.get(k.id) === "pass";
    total += k.peso;
    if (ok) passed += k.peso;
    const acc = byCompetency.get(k.competencia) ?? { total: 0, passed: 0 };
    acc.total += k.peso;
    if (ok) acc.passed += k.peso;
    byCompetency.set(k.competencia, acc);
  }
  if (total <= 0) throw new Error("Criteria weights must add up to more than 0");

  const puntaje = round2((100 * passed) / total);
  const competencias: Partial<Record<Competency, number>> = {};
  for (const [c, acc] of byCompetency) {
    if (acc.total > 0) competencias[c] = round2((100 * acc.passed) / acc.total);
  }

  const mandatoryOk = criteria.obligatorios.every((id) => status.get(id) === "pass");
  return {
    resultado: puntaje >= criteria.umbral && mandatoryOk ? "aprobado" : "reprobado",
    puntaje,
    competencias,
  };
}
