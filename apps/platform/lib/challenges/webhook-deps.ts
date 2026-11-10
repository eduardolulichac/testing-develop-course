import "server-only";
import { track } from "@/lib/analytics/server";
import { siteUrl } from "@/lib/env";
import { recalculateLevelFor } from "@/lib/levels/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createFakeRunVerifier, createGitHubRunVerifier } from "./verify";
import type { WebhookDeps } from "./webhook";

const DEFAULT_EVALUATOR_REPO = "eduardolulichac/qa-course-evaluator";
const DEFAULT_EVALUATOR_WORKFLOW = ".github/workflows/evaluate.yml";

/** Structured log line; never includes keys, signatures or the request body. */
function log(entry: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "challenge-webhook", ...entry }));
}

function required(name: string, minLength = 1): string {
  const value = process.env[name];
  if (!value || value.length < minLength) throw new Error(`Falta ${name}`);
  return value;
}

/**
 * `GITHUB_VERIFY_MODE=fake` accepts every run, so production refuses to start with it. The E2E job
 * runs `next start` (NODE_ENV=production) and opts in with `COURSE_E2E=1`; that opt-in is ignored
 * on Vercel.
 */
export function verifyMode(env: Record<string, string | undefined> = process.env): "live" | "fake" {
  const mode = env.GITHUB_VERIFY_MODE ?? "live";
  if (mode !== "live" && mode !== "fake") throw new Error("GITHUB_VERIFY_MODE inválido");
  const e2eOptIn = env.COURSE_E2E === "1" && !env.VERCEL;
  if (mode === "fake" && env.NODE_ENV === "production" && !e2eOptIn) {
    throw new Error("GITHUB_VERIFY_MODE=fake no se admite en producción");
  }
  return mode;
}

/** `EVALUATOR_ALLOWED`: comma-separated `version@sha40` pairs. */
export function parseAllowedEvaluators(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function createWebhookDeps(): WebhookDeps {
  const admin = createAdminClient();
  const mode = verifyMode();

  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(`${fn} falló: ${error.message}`);
    return data as T;
  };

  return {
    now: () => Date.now(),
    masterSecret: required("CHALLENGE_MASTER_SECRET", 32),
    siteUrl: siteUrl(),
    evaluator: {
      repo: process.env.EVALUATOR_REPO ?? DEFAULT_EVALUATOR_REPO,
      workflowPath: process.env.EVALUATOR_WORKFLOW_PATH ?? DEFAULT_EVALUATOR_WORKFLOW,
      allowed: parseAllowedEvaluators(process.env.EVALUATOR_ALLOWED),
    },
    verifier:
      mode === "fake"
        ? createFakeRunVerifier()
        : createGitHubRunVerifier({ token: process.env.GITHUB_API_TOKEN, log }),
    gate: (keyId, ipHash) => rpc("challenge_webhook_gate", { p_key_id: keyId, p_ip_hash: ipHash }),
    reserve: (a) =>
      rpc("reserve_challenge_submission", {
        p_link_id: a.linkId,
        p_key_id: a.keyId,
        p_nonce: a.nonce,
        p_run_id: a.runId,
        p_run_attempt: a.runAttempt,
        p_commit_sha: a.commitSha,
        p_payload: a.payload,
      }),
    finalize: (i) =>
      rpc("finalize_challenge_submission", {
        p_id: i.id,
        p_estado: i.estado,
        p_motivo: i.motivo,
        p_resultado: i.resultado,
        p_puntaje: i.puntaje,
        p_detalle: i.detalle,
        p_verificacion: i.verificacion,
      }),
    log,
    recalculateLevel: recalculateLevelFor,
    onVerified: (e) =>
      void track(e.userId, "challenge_submitted", {
        reto: e.reto,
        resultado: e.resultado,
        intento: e.intento,
      }),
  };
}
