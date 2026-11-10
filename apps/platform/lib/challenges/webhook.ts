import { createHash } from "node:crypto";
import {
  MAX_BODY_BYTES,
  TIMESTAMP_REGEX,
  TIMESTAMP_WINDOW_SECONDS,
  challengeCriteriaSchema,
  challengeHeadersSchema,
  challengeResultPayloadSchema,
  deriveChallengeKey,
  scoreSubmission,
  verifySignature,
  type ChallengeCriteria,
  type ChallengeResultPayload,
} from "@course/shared";
import type { GitHubRunVerifier } from "./verify";

/** Link row the gate returns (docs/EVALUACION_DISENO.md section 4.4, step 4). */
export type GateLink = {
  id: string;
  user_id: string;
  key_version: number;
  revoked_at: string | null;
  exercise_id: string;
  exercise_slug: string;
  exercise_tipo: string;
  lesson_estado: string;
  repo_id: number;
  repo_full_name: string;
  github_id: number;
  criterio_aprobacion: unknown;
};

export type GateResult = { limited: boolean; link: GateLink | null };

export type ReserveResult =
  | { status: "replay" }
  | { status: "limit" | "limit_global"; retry_after: number }
  | { status: "already"; submission: SubmissionSummary }
  | { status: "reverify" | "reserved"; id: string };

export type SubmissionSummary = {
  id: string;
  estado_verificacion?: string;
  motivo?: string | null;
  resultado?: string | null;
  puntaje?: number | null;
  intento?: number | null;
};

export type FinalizeInput = {
  id: string;
  estado: "verificado" | "rechazado" | "error_verificacion";
  motivo: string | null;
  resultado: string | null;
  puntaje: number | null;
  detalle: Record<string, unknown>;
  verificacion: Record<string, unknown>;
};

export type WebhookDeps = {
  /** Current time in milliseconds. */
  now: () => number;
  masterSecret: string;
  siteUrl: string;
  evaluator: { repo: string; workflowPath: string; allowed: ReadonlySet<string> };
  verifier: GitHubRunVerifier;
  gate: (keyId: string, ipHash: string) => Promise<GateResult>;
  reserve: (args: {
    linkId: string;
    keyId: string;
    nonce: string;
    runId: number;
    runAttempt: number;
    commitSha: string;
    payload: Record<string, unknown>;
  }) => Promise<ReserveResult>;
  finalize: (input: FinalizeInput) => Promise<{ updated: boolean; submission: SubmissionSummary }>;
  log: (entry: Record<string, unknown>) => void;
  /** Recalculates the student's level after a verified submission. Must not throw; see below. */
  recalculateLevel?: (userId: string) => Promise<unknown>;
  /** Analytics hook (optional, must not throw); called once per newly recorded verified run. */
  onVerified?: (event: {
    userId: string;
    reto: string;
    resultado: string;
    intento: number | null;
  }) => void;
};

/** Recalculates the level; a failure is logged (with the ids to find it) and never propagates. */
async function safeRecalculate(deps: WebhookDeps, userId: string, submissionId: string) {
  try {
    await deps.recalculateLevel?.(userId);
  } catch (error) {
    deps.log({
      event: "level_recalculation_failed",
      user_id: userId,
      submission: submissionId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

function json(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

const fail = (status: number, error: string, retryAfter?: number) =>
  json(status, { error }, retryAfter ? { "retry-after": String(retryAfter) } : {});

/**
 * Reads the raw body counting bytes, so a body without `content-length` (chunked) is cut at the
 * limit instead of being buffered whole. Returns null if it is too large.
 */
export async function readBodyLimited(request: Request, limit: number): Promise<Buffer | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > limit) return null;
  if (!request.body) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** `x-vercel-forwarded-for` or `x-real-ip` (first value of a list); `local` without them. */
export function clientIp(headers: Headers): string {
  const raw = headers.get("x-vercel-forwarded-for") ?? headers.get("x-real-ip");
  return raw?.split(",")[0]?.trim() || "local";
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && new Set(a).size === a.length && a.every((id) => b.includes(id));

/**
 * The webhook, from cheap to expensive checks (section 4.4). Everything before the signature
 * answers with generic 4xx; after it, the caller has proven to be the student and gets a stable
 * `error` code.
 */
export async function handleChallengeResult(
  request: Request,
  deps: WebhookDeps,
): Promise<Response> {
  // 1. Method, content type and size, in memory.
  if (request.method !== "POST") return fail(405, "method_not_allowed");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return fail(415, "unsupported_media_type");
  }
  const rawBody = await readBodyLimited(request, MAX_BODY_BYTES);
  if (!rawBody) return fail(413, "payload_too_large");

  // 2. Headers.
  const headers = challengeHeadersSchema.safeParse({
    "x-course-key-id": request.headers.get("x-course-key-id"),
    "x-course-timestamp": request.headers.get("x-course-timestamp"),
    "x-course-nonce": request.headers.get("x-course-nonce"),
    "x-course-signature": request.headers.get("x-course-signature"),
  });
  if (!headers.success) return fail(400, "bad_request");
  const keyId = headers.data["x-course-key-id"];
  const timestamp = headers.data["x-course-timestamp"];
  const nonce = headers.data["x-course-nonce"];

  // 3. Time window.
  if (
    !TIMESTAMP_REGEX.test(timestamp) ||
    Math.abs(deps.now() / 1000 - Number(timestamp)) > TIMESTAMP_WINDOW_SECONDS
  ) {
    return fail(401, "unauthorized");
  }

  // 4. Database step 1: per-IP counter and the link (only while the GitHub identity is linked).
  const ipHash = createHash("sha256")
    .update(clientIp(request.headers) + deps.masterSecret)
    .digest("hex");
  const gate = await deps.gate(keyId, ipHash);
  if (gate.limited) return fail(429, "rate_limited", 60);

  // 5. Signature. A missing or revoked link is checked against a throwaway key, same answer.
  const link = gate.link && !gate.link.revoked_at ? gate.link : null;
  const key = deriveChallengeKey(deps.masterSecret, keyId, link ? link.key_version : 0);
  const signatureOk = verifySignature(
    headers.data["x-course-signature"],
    key,
    timestamp,
    nonce,
    rawBody,
  );
  if (!link || !signatureOk) return fail(401, "unauthorized");

  // 6. Payload shape; headers and body must agree.
  let payload: ChallengeResultPayload;
  try {
    const parsed = challengeResultPayloadSchema.safeParse(JSON.parse(rawBody.toString("utf8")));
    if (!parsed.success) return fail(400, "invalid_payload");
    payload = parsed.data;
  } catch {
    return fail(400, "invalid_payload");
  }
  if (
    payload.key_id !== keyId ||
    String(payload.timestamp) !== timestamp ||
    payload.nonce !== nonce
  ) {
    return fail(400, "invalid_payload");
  }

  // 7. What the platform expects for this link and challenge.
  if (
    payload.exercise !== link.exercise_slug ||
    link.exercise_tipo !== "reto" ||
    link.lesson_estado !== "publicado"
  ) {
    return fail(422, "exercise_mismatch");
  }
  if (payload.repo.id !== link.repo_id) return fail(422, "repo_mismatch");
  if (!deps.evaluator.allowed.has(`${payload.evaluator.version}@${payload.evaluator.sha}`)) {
    return fail(422, "evaluator_not_allowed");
  }
  const criteriaParsed = challengeCriteriaSchema.safeParse(link.criterio_aprobacion);
  if (!criteriaParsed.success) {
    deps.log({ event: "challenge_criteria_invalid", exercise: link.exercise_slug });
    return fail(422, "exercise_mismatch");
  }
  const criteria: ChallengeCriteria = criteriaParsed.data;
  if (
    payload.arena.scenario !== criteria.arena.escenario ||
    payload.arena.release !== criteria.arena.release ||
    payload.arena.rng_seed !== criteria.arena.semilla
  ) {
    return fail(422, "arena_mismatch");
  }
  if (
    !sameSet(
      payload.criteria.map((c) => c.id),
      criteria.criterios.map((c) => c.id),
    )
  ) {
    return fail(422, "criteria_mismatch");
  }

  // 8. Database step 2: nonce, limits and the pending row, in one transaction.
  const reservation = await deps.reserve({
    linkId: link.id,
    keyId,
    nonce,
    runId: payload.run.id,
    runAttempt: payload.run.attempt,
    commitSha: payload.run.commit_sha,
    payload: { evaluator_version: payload.evaluator.version, arena: payload.arena },
  });

  const url = `${deps.siteUrl}/retos/${link.exercise_slug}`;
  const recorded = (s: SubmissionSummary, status: number, extra: Record<string, unknown> = {}) =>
    json(status, {
      ...extra,
      submission_id: s.id,
      resultado: s.resultado ?? null,
      puntaje: s.puntaje ?? null,
      url,
    });

  switch (reservation.status) {
    case "replay":
      return fail(409, "replay");
    case "limit":
      return fail(429, "rate_limited", reservation.retry_after);
    case "limit_global":
      return fail(503, "verification_unavailable", reservation.retry_after);
    case "already":
      // A redelivery also repairs a level whose recalculation failed the first time.
      await safeRecalculate(deps, link.user_id, reservation.submission.id);
      return recorded(reservation.submission, 200, { status: "already_recorded" });
  }

  // 9. GitHub (the pending row exists, so a retry resumes it).
  const submissionId = reservation.id;
  const verification = await deps.verifier.verify({
    repoFullName: link.repo_full_name,
    repoId: link.repo_id,
    ownerId: link.github_id,
    runId: payload.run.id,
    attempt: payload.run.attempt,
    commitSha: payload.run.commit_sha,
    event: payload.run.event,
    evaluatorSha: payload.evaluator.sha,
    evaluatorRepo: deps.evaluator.repo,
    evaluatorWorkflowPath: deps.evaluator.workflowPath,
    timestampSec: payload.timestamp,
    nowMs: deps.now(),
  });

  if (!verification.ok && verification.kind === "unavailable") {
    await deps.finalize({
      id: submissionId,
      estado: "error_verificacion",
      motivo: "verification_unavailable",
      resultado: null,
      puntaje: null,
      detalle: {},
      verificacion: {},
    });
    return fail(503, "verification_unavailable", verification.retryAfterSeconds);
  }

  if (!verification.ok) {
    deps.log({ event: "run_rejected", reason: verification.reason, submission: submissionId });
    await deps.finalize({
      id: submissionId,
      estado: "rechazado",
      motivo: "run_not_verified",
      resultado: null,
      puntaje: null,
      detalle: {},
      // Internal only (never shown to students).
      verificacion: { reason: verification.reason },
    });
    return fail(422, "run_not_verified");
  }

  // 10. Score, computed here: the payload never carries one.
  const score = scoreSubmission(
    criteria,
    payload.criteria.map((c) => ({ id: c.id, status: c.status })),
  );
  const byId = new Map(criteria.criterios.map((c) => [c.id, c]));

  // 11. Database step 3: final state.
  const detalle = {
    // Title and failure feedback are copied so the history does not change if the author edits
    // the challenge later.
    criterios: payload.criteria.map((c) => ({
      id: c.id,
      status: c.status,
      evidence: c.evidence,
      titulo: byId.get(c.id)?.titulo,
      feedback_fallo: byId.get(c.id)?.feedback_fallo,
    })),
    competencias: score.competencias,
    summary: payload.summary ?? null,
  };
  const final = await deps.finalize({
    id: submissionId,
    estado: "verificado",
    motivo: null,
    resultado: score.resultado,
    puntaje: score.puntaje,
    detalle,
    verificacion: verification.snapshot,
  });
  if (!final.updated) {
    await safeRecalculate(deps, link.user_id, final.submission.id);
    return recorded(final.submission, 200, { status: "already_recorded" });
  }
  deps.log({
    event: "challenge_verified",
    exercise: link.exercise_slug,
    resultado: score.resultado,
    intento: final.submission.intento ?? null,
  });
  // After `finalize`, in its own call: a failure in the level rules must not lose the submission.
  await safeRecalculate(deps, link.user_id, final.submission.id);
  deps.onVerified?.({
    userId: link.user_id,
    reto: link.exercise_slug,
    resultado: score.resultado,
    intento: final.submission.intento ?? null,
  });
  return recorded(final.submission, 201);
}
