import { describe, expect, it, vi } from "vitest";
import { checkRepoForLink, githubIdFromUser, lookupRepo, parseRepoUrl } from "./github";

describe("parseRepoUrl", () => {
  it.each([
    ["https://github.com/ana/reto-1-1-login", "ana", "reto-1-1-login"],
    ["https://github.com/ana/reto.git", "ana", "reto"],
    ["  https://github.com/Ana-B/repo/  ", "Ana-B", "repo"],
  ])("accepts %s", (url, owner, repo) => {
    expect(parseRepoUrl(url)).toEqual({ owner, repo });
  });

  it.each([
    "http://github.com/ana/repo",
    "https://github.com.evil.com/ana/repo",
    "https://github.com/ana",
    "https://github.com/ana/repo/tree/main",
    "https://github.com/-ana/repo",
    "https://github.com/ana/..",
    "https://github.com/ana/re po",
    "https://gitlab.com/ana/repo",
    "ana/repo",
  ])("rejects %s", (url) => {
    expect(parseRepoUrl(url)).toBeNull();
  });
});

describe("githubIdFromUser", () => {
  const user = (identities: { provider: string; id: string }[] | undefined) =>
    ({ identities }) as never;

  it("reads the numeric id of the github identity", () => {
    expect(
      githubIdFromUser(
        user([
          { provider: "google", id: "1" },
          { provider: "github", id: "583231" },
        ]),
      ),
    ).toBe(583231);
  });

  it.each([undefined, [], [{ provider: "google", id: "5" }]])(
    "returns null without a github identity (%j)",
    (i) => {
      expect(githubIdFromUser(user(i))).toBeNull();
    },
  );

  it.each(["0", "-3", "12ab", "", "1e3", "99999999999999999"])("rejects the id %j", (id) => {
    expect(githubIdFromUser(user([{ provider: "github", id }]))).toBeNull();
  });
});

const body = (over: Record<string, unknown> = {}) => ({
  id: 99,
  full_name: "ana/reto",
  private: false,
  fork: false,
  owner: { id: 7, login: "ana" },
  template_repository: { full_name: "eduardolulichac/reto-1-1-login" },
  ...over,
});
const respond = (status: number, json: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(json), { status, headers });

describe("lookupRepo", () => {
  it("returns the repo and sends the token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, body()));
    const result = await lookupRepo("ana", "reto", "tok", fetchMock as never);
    expect(result).toEqual({
      ok: true,
      repo: {
        id: 99,
        fullName: "ana/reto",
        ownerId: 7,
        ownerLogin: "ana",
        private: false,
        fork: false,
        templateFullName: "eduardolulichac/reto-1-1-login",
      },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.github.com/repos/ana/reto");
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe("Bearer tok");
  });

  it("follows a 301 once, to the API host", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        respond(301, {}, { location: "https://api.github.com/repositories/99" }),
      )
      .mockResolvedValueOnce(respond(200, body({ full_name: "ana/nuevo" })));
    const result = await lookupRepo("ana", "viejo", undefined, fetchMock as never);
    expect(result.ok && result.repo.fullName).toBe("ana/nuevo");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not follow a redirect to another host", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(respond(301, {}, { location: "https://evil.example/x" }));
    expect(await lookupRepo("ana", "r", undefined, fetchMock as never)).toEqual({
      ok: false,
      reason: "github_error",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [404, "not_found"],
    [403, "rate_limited"],
    [429, "rate_limited"],
    [500, "github_error"],
  ])("maps status %i to %s", async (status, reason) => {
    const fetchMock = vi.fn().mockResolvedValue(respond(status, {}));
    expect(await lookupRepo("a", "b", undefined, fetchMock as never)).toEqual({
      ok: false,
      reason,
    });
  });

  it("treats a malformed body or a network error as a GitHub error", async () => {
    const malformed = vi.fn().mockResolvedValue(respond(200, { id: "x" }));
    expect(await lookupRepo("a", "b", undefined, malformed as never)).toEqual({
      ok: false,
      reason: "github_error",
    });
    const broken = vi.fn().mockRejectedValue(new Error("boom"));
    expect(await lookupRepo("a", "b", undefined, broken as never)).toEqual({
      ok: false,
      reason: "github_error",
    });
  });
});

describe("checkRepoForLink", () => {
  const repo = {
    id: 1,
    fullName: "a/b",
    ownerId: 7,
    ownerLogin: "a",
    private: false,
    fork: false,
    templateFullName: null,
  };

  it("accepts a public, non-fork repo owned by the linked account", () => {
    expect(checkRepoForLink(repo, 7)).toBeNull();
  });

  it("rejects private, forked and foreign repos", () => {
    expect(checkRepoForLink({ ...repo, private: true }, 7)).toBe("private");
    expect(checkRepoForLink({ ...repo, fork: true }, 7)).toBe("fork");
    expect(checkRepoForLink(repo, 8)).toBe("not_owner");
  });
});
