import { describe, expect, it, vi } from "vitest";
import { checkRun, createGitHubRunVerifier, type RunExpectation } from "./verify";

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const NOW = Date.parse("2026-11-06T12:00:00Z");
const exp: RunExpectation = {
  repoFullName: "alumna/reto",
  repoId: 10,
  ownerId: 20,
  runId: 99,
  attempt: 1,
  commitSha: "c".repeat(40),
  event: "push",
  evaluatorSha: SHA,
  evaluatorRepo: "eduardolulichac/qa-course-evaluator",
  evaluatorWorkflowPath: ".github/workflows/evaluate.yml",
  timestampSec: NOW / 1000,
  nowMs: NOW,
};
const run = () => ({
  id: 99,
  head_sha: "c".repeat(40),
  event: "push",
  run_attempt: 1,
  status: "in_progress",
  conclusion: null,
  run_started_at: "2026-11-06T11:55:00Z",
  repository: { id: 10, owner: { id: 20 } },
  head_repository: { id: 10 },
  referenced_workflows: [
    { path: `eduardolulichac/qa-course-evaluator/.github/workflows/evaluate.yml@${SHA}`, sha: SHA },
  ],
});

describe("checkRun", () => {
  it("accepts an in-progress run that matches", () => {
    expect(checkRun(run(), exp).ok).toBe(true);
  });
  it("accepts other statuses and a differently-cased evaluator path", () => {
    const r = run();
    r.status = "waiting";
    r.referenced_workflows[0]!.path = `EduardoLulichac/QA-Course-Evaluator/.github/workflows/evaluate.yml@${SHA}`;
    expect(checkRun(r, exp).ok).toBe(true);
  });
  it.each([
    ["other repository", (r: ReturnType<typeof run>) => (r.repository.id = 11)],
    ["other owner", (r: ReturnType<typeof run>) => (r.repository.owner.id = 21)],
    ["fork", (r: ReturnType<typeof run>) => (r.head_repository.id = 12)],
    ["other head_sha", (r: ReturnType<typeof run>) => (r.head_sha = "d".repeat(40))],
    ["other event", (r: ReturnType<typeof run>) => (r.event = "workflow_dispatch")],
    ["other attempt", (r: ReturnType<typeof run>) => (r.run_attempt = 2)],
    ["older than 2 h", (r: ReturnType<typeof run>) => (r.run_started_at = "2026-11-06T09:59:00Z")],
    [
      "started after the payload",
      (r: ReturnType<typeof run>) => (r.run_started_at = "2026-11-06T12:06:00Z"),
    ],
    ["no evaluator", (r: ReturnType<typeof run>) => (r.referenced_workflows = [])],
    [
      "other evaluator sha",
      (r: ReturnType<typeof run>) =>
        (r.referenced_workflows[0]!.path = r.referenced_workflows[0]!.path.replace(
          SHA,
          "f".repeat(40),
        )),
    ],
    [
      "path without @sha",
      (r: ReturnType<typeof run>) =>
        (r.referenced_workflows[0]!.path =
          "eduardolulichac/qa-course-evaluator/.github/workflows/evaluate.yml"),
    ],
  ])("rejects %s", (_name, mutate) => {
    const r = run();
    mutate(r);
    expect(checkRun(r, exp)).toMatchObject({ ok: false, kind: "rejected" });
  });
});

describe("createGitHubRunVerifier", () => {
  const verifier = (res: Response | Error) =>
    createGitHubRunVerifier({
      token: "t",
      fetchImpl: vi.fn(async () => {
        if (res instanceof Error) throw res;
        return res;
      }) as unknown as typeof fetch,
    });

  it("asks for the exact attempt", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(run()));
    await createGitHubRunVerifier({
      token: "t",
      fetchImpl,
    }).verify(exp);
    expect(String(fetchImpl.mock.calls[0]![0])).toMatch(
      /\/repos\/alumna\/reto\/actions\/runs\/99\/attempts\/1$/,
    );
  });
  it("404 is a rejection", async () => {
    expect(await verifier(new Response("", { status: 404 })).verify(exp)).toMatchObject({
      kind: "rejected",
    });
  });
  it("5xx and network errors are unavailable", async () => {
    expect(await verifier(new Response("", { status: 503 })).verify(exp)).toMatchObject({
      kind: "unavailable",
    });
    expect(await verifier(new Error("timeout")).verify(exp)).toMatchObject({ kind: "unavailable" });
  });
  it("403 with an empty quota derives Retry-After from x-ratelimit-reset", async () => {
    const res = new Response("", {
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(NOW / 1000 + 120) },
    });
    expect(await verifier(res).verify(exp)).toEqual({
      ok: false,
      kind: "unavailable",
      retryAfterSeconds: 120,
    });
  });
});
