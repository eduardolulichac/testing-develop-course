import { githubApiBase } from "./github";

/** What the webhook claims about a run, plus what the platform knows about the link. */
export type RunExpectation = {
  repoFullName: string;
  repoId: number;
  /** Numeric GitHub id of the linked account (the repository owner). */
  ownerId: number;
  runId: number;
  attempt: number;
  commitSha: string;
  event: "push" | "workflow_dispatch";
  evaluatorSha: string;
  /** `owner/repo` and workflow path of the public evaluator. */
  evaluatorRepo: string;
  evaluatorWorkflowPath: string;
  /** `timestamp` of the signed payload, in seconds. */
  timestampSec: number;
  nowMs: number;
};

export type VerifyResult =
  | { ok: true; snapshot: Record<string, unknown> }
  | { ok: false; kind: "rejected"; reason: string }
  | { ok: false; kind: "unavailable"; retryAfterSeconds: number };

/** Verifies a run against GitHub. Injectable so tests never reach the network. */
export interface GitHubRunVerifier {
  verify(expectation: RunExpectation): Promise<VerifyResult>;
}

const MAX_RUN_AGE_MS = 2 * 60 * 60 * 1000;
const CLOCK_TOLERANCE_MS = 300 * 1000;

type RunBody = {
  id?: unknown;
  head_sha?: unknown;
  event?: unknown;
  run_attempt?: unknown;
  status?: unknown;
  conclusion?: unknown;
  run_started_at?: unknown;
  repository?: { id?: unknown; owner?: { id?: unknown } } | null;
  head_repository?: { id?: unknown } | null;
  referenced_workflows?: Array<{ path?: unknown; sha?: unknown }> | null;
};

/**
 * Pure checks of docs/EVALUACION_DISENO.md section 4.5 over the body of
 * `GET /repos/{owner}/{repo}/actions/runs/{id}/attempts/{n}`. Any `status` is accepted: the run is
 * still in progress when its own last step sends the webhook.
 */
export function checkRun(run: RunBody, exp: RunExpectation): VerifyResult {
  const reject = (reason: string): VerifyResult => ({ ok: false, kind: "rejected", reason });

  if (run.id !== exp.runId) return reject("run_id_mismatch");
  if (run.repository?.id !== exp.repoId) return reject("repository_id_mismatch");
  if (run.repository?.owner?.id !== exp.ownerId) return reject("owner_id_mismatch");
  if (run.head_repository?.id !== run.repository?.id) return reject("fork");
  if (run.head_sha !== exp.commitSha) return reject("head_sha_mismatch");
  if (run.event !== exp.event) return reject("event_mismatch");
  if (run.run_attempt !== exp.attempt) return reject("attempt_mismatch");

  const startedAt = typeof run.run_started_at === "string" ? Date.parse(run.run_started_at) : NaN;
  if (Number.isNaN(startedAt)) return reject("no_run_started_at");
  if (exp.nowMs - startedAt > MAX_RUN_AGE_MS) return reject("run_too_old");
  if (startedAt > exp.timestampSec * 1000 + CLOCK_TOLERANCE_MS) return reject("run_after_payload");

  // `owner/repo` is case-insensitive on GitHub; the SHA is compared exactly.
  const wantedPath = `${exp.evaluatorRepo}/${exp.evaluatorWorkflowPath}`.toLowerCase();
  const usesEvaluator = (run.referenced_workflows ?? []).some((w) => {
    if (typeof w.path !== "string" || typeof w.sha !== "string") return false;
    const at = w.path.lastIndexOf("@");
    if (at < 0) return false;
    return (
      w.path.slice(0, at).toLowerCase() === wantedPath &&
      w.path.slice(at + 1) === exp.evaluatorSha &&
      w.sha === exp.evaluatorSha
    );
  });
  if (!usesEvaluator) return reject("evaluator_not_referenced");

  return {
    ok: true,
    snapshot: {
      status: run.status ?? null,
      conclusion: run.conclusion ?? null,
      run_started_at: run.run_started_at,
      head_sha: run.head_sha,
      event: run.event,
      run_attempt: run.run_attempt,
    },
  };
}

/** Seconds to wait, from `retry-after` or, with an empty quota, `x-ratelimit-reset`. */
function retryAfterSeconds(res: Response, nowMs: number): number {
  const retry = Number(res.headers.get("retry-after"));
  if (Number.isFinite(retry) && retry > 0) return Math.ceil(retry);
  if (res.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    if (Number.isFinite(reset) && reset > 0) {
      return Math.max(1, Math.ceil(reset - nowMs / 1000));
    }
  }
  return 60;
}

export type RealVerifierOptions = {
  token: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  log?: (entry: Record<string, unknown>) => void;
};

/** Real verifier: one call per run attempt, with the read-only server token (P2). */
export function createGitHubRunVerifier(opts: RealVerifierOptions): GitHubRunVerifier {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "qa-course-platform",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  return {
    async verify(exp) {
      const base = githubApiBase();
      const get = (url: string) =>
        fetchImpl(url, {
          headers,
          redirect: "manual",
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });
      const unavailable = (retryAfter: number): VerifyResult => ({
        ok: false,
        kind: "unavailable",
        retryAfterSeconds: retryAfter,
      });

      try {
        let res = await get(
          `${base}/repos/${exp.repoFullName}/actions/runs/${exp.runId}/attempts/${exp.attempt}`,
        );
        // A renamed or transferred repo answers 301: follow once, only inside the API host.
        if (res.status === 301) {
          const location = res.headers.get("location");
          if (!location?.startsWith(`${base}/`)) return unavailable(60);
          res = await get(location);
        }
        opts.log?.({
          event: "github_run_lookup",
          status: res.status,
          rate_remaining: res.headers.get("x-ratelimit-remaining"),
        });
        if (res.status === 404) return { ok: false, kind: "rejected", reason: "run_not_found" };
        if (res.status === 403 || res.status === 429) {
          return unavailable(retryAfterSeconds(res, exp.nowMs));
        }
        if (!res.ok) return unavailable(60);
        return checkRun((await res.json()) as RunBody, exp);
      } catch {
        return unavailable(60);
      }
    },
  };
}

/** Local and CI only: accepts every run. The platform refuses it with NODE_ENV=production. */
export function createFakeRunVerifier(): GitHubRunVerifier {
  return {
    async verify() {
      return { ok: true, snapshot: { fake: true } };
    },
  };
}
