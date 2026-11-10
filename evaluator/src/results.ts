import type { ChallengeCriteria } from "@course/shared";
import type { CriterionResult } from "./evaluate.ts";

/** `results.json`: the payload without `key_id`, `timestamp` and `nonce` (added by `report`). */
export interface ResultsFile {
  schema: "challenge-result/v1";
  exercise: string;
  evaluator: { version: string; sha?: string };
  arena: {
    image_digest: string;
    seed_version: string;
    scenario: string;
    release: string | null;
    rng_seed: number;
  };
  criteria: Array<{ id: string; status: "pass" | "fail" | "error"; evidence: string }>;
  /** Not sent: feedback text for the job summary only. */
  feedback: Record<string, string>;
  summary: { duration_ms: number; tests_total: number };
}

export function buildResults(args: {
  exercise: string;
  version: string;
  criteria: ChallengeCriteria;
  results: CriterionResult[];
  imageDigest: string;
  seedVersion: string;
  durationMs: number;
  testsTotal: number;
}): ResultsFile {
  return {
    schema: "challenge-result/v1",
    exercise: args.exercise,
    evaluator: { version: args.version },
    arena: {
      image_digest: args.imageDigest,
      seed_version: args.seedVersion,
      scenario: args.criteria.arena.escenario,
      release: args.criteria.arena.release,
      rng_seed: args.criteria.arena.semilla,
    },
    criteria: args.results.map(({ id, status, evidence }) => ({ id, status, evidence })),
    feedback: Object.fromEntries(
      args.results.flatMap((r) => (r.feedback ? [[r.id, r.feedback]] : [])),
    ),
    summary: { duration_ms: args.durationMs, tests_total: args.testsTotal },
  };
}

/** Every criterion in `error`: used when the evaluation job left no results. */
export function allErrors(criteria: ChallengeCriteria, evidence: string) {
  return criteria.criterios.map((k) => ({
    id: k.id,
    status: "error" as const,
    evidence,
  }));
}
