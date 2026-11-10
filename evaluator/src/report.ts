import { randomBytes } from "node:crypto";
import {
  challengeResultPayloadSchema,
  computeSignature,
  parseChallengeKey,
  type ChallengeResultPayload,
} from "@course/shared";
import type { ResultsFile } from "./results.ts";

export interface ReportContext {
  keyId: string;
  /** The key as the student sees it (`cck_…`). Never logged. */
  shownKey: string;
  endpoint: string;
  repo: { id: number; full_name: string };
  run: { id: number; attempt: number; commit_sha: string; event: "push" | "workflow_dispatch" };
  evaluatorSha: string;
}

export interface ReportDeps {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
}

export type ReportOutcome =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number | null; code: string; message: string };

const RETRY_DELAYS_MS = [2000, 4000, 8000];

const MESSAGES: Record<string, string> = {
  unauthorized: "La clave o el key_id no son válidos. Copia de nuevo la clave desde la plataforma.",
  rate_limited: "Demasiados envíos seguidos. Espera un poco y vuelve a lanzar el workflow.",
  exercise_mismatch: "El reto no coincide con el que tienes vinculado.",
  repo_mismatch: "Este repositorio no es el que vinculaste para este reto.",
  evaluator_not_allowed: "La versión del evaluador no está permitida. No edites evaluar.yml.",
  arena_mismatch: "La configuración de la Arena no coincide con la del reto.",
  criteria_mismatch: "Los criterios enviados no coinciden con los del reto.",
  run_not_verified: "GitHub no confirmó esta ejecución. No edites evaluar.yml.",
  verification_unavailable: "GitHub no respondió. Vuelve a lanzar el workflow.",
  invalid_payload: "El resultado no tiene el formato esperado.",
};

export function buildPayload(
  results: ResultsFile,
  ctx: ReportContext,
  nonce: string,
  timestamp: number,
): ChallengeResultPayload {
  return challengeResultPayloadSchema.parse({
    schema: results.schema,
    key_id: ctx.keyId,
    timestamp,
    nonce,
    exercise: results.exercise,
    repo: ctx.repo,
    run: ctx.run,
    evaluator: { version: results.evaluator.version, sha: ctx.evaluatorSha },
    arena: results.arena,
    criteria: results.criteria,
    summary: results.summary,
  });
}

/** Signs and sends. Each retry gets a fresh nonce, timestamp and signature (design §4.6). */
export async function sendResults(
  results: ResultsFile,
  ctx: ReportContext,
  deps: ReportDeps,
): Promise<ReportOutcome> {
  const key = parseChallengeKey(ctx.shownKey);
  if (!key) {
    return {
      ok: false,
      status: null,
      code: "bad_key",
      message:
        "COURSE_CHALLENGE_KEY no es válida: debe ser `cck_` seguido de 43 caracteres. Vuelve a copiarla completa desde la página del reto.",
    };
  }

  let last: ReportOutcome = { ok: false, status: null, code: "network", message: "Sin respuesta" };
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await deps.sleep(RETRY_DELAYS_MS[attempt - 1]!);

    const nonce = randomBytes(16).toString("base64url");
    const timestamp = Math.floor(deps.now() / 1000);
    const body = JSON.stringify(buildPayload(results, ctx, nonce, timestamp));
    const signature = computeSignature(key, String(timestamp), nonce, body);

    try {
      const res = await deps.fetch(ctx.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-course-key-id": ctx.keyId,
          "x-course-timestamp": String(timestamp),
          "x-course-nonce": nonce,
          "x-course-signature": signature,
        },
        body,
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // keep the raw text
      }
      if (res.status === 200 || res.status === 201)
        return { ok: true, status: res.status, body: parsed };

      const code = String((parsed as { error?: string } | null)?.error ?? "unknown");
      last = {
        ok: false,
        status: res.status,
        code,
        message: MESSAGES[code] ?? `Respuesta ${res.status}`,
      };
      // Only transient failures are retried; any other 4xx will not change by trying again.
      if (res.status < 500) return last;
      deps.log(`Intento ${attempt + 1}: ${res.status} ${code}`);
    } catch {
      last = {
        ok: false,
        status: null,
        code: "network",
        message: "No se pudo conectar con la plataforma",
      };
      deps.log(`Intento ${attempt + 1}: sin conexión`);
    }
  }
  return last;
}

/** Markdown table for `$GITHUB_STEP_SUMMARY`. */
export function summaryTable(results: ResultsFile, link: string | null): string {
  const icon = { pass: "✅", fail: "❌", error: "⚠️" } as const;
  const rows = results.criteria.map((c) => {
    const tip = results.feedback[c.id] ? ` — ${results.feedback[c.id]}` : "";
    return `| ${icon[c.status]} | \`${c.id}\` | ${c.evidence.replace(/\|/g, "\\|")}${tip.replace(/\|/g, "\\|")} |`;
  });
  return [
    `## Resultado de ${results.exercise}`,
    "",
    "| | Criterio | Detalle |",
    "| --- | --- | --- |",
    ...rows,
    "",
    link ? `Detalle en la plataforma: ${link}` : "",
  ].join("\n");
}
