import type { User } from "@supabase/supabase-js";

/** Overridable so E2E tests can point the server at a fake GitHub. */
export const githubApiBase = () => process.env.GITHUB_API_URL ?? "https://api.github.com";
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

/** `https://github.com/<owner>/<repo>` (optional trailing slash or `.git`), nothing else. */
export function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(input.trim());
  const owner = m?.[1];
  const repo = m?.[2];
  if (!owner || !repo || !OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") {
    return null;
  }
  return { owner, repo };
}

/**
 * Numeric GitHub id of the linked identity. It comes from `auth.getUser()` (the Auth server
 * answers, so it is authentic): `identity.id` is the GitHub id as text. Never `identity_id` (the
 * internal uuid) and never `user_metadata`, which the user can edit.
 */
export function githubIdFromUser(user: Pick<User, "identities">): number | null {
  const identity = user.identities?.find((i) => i.provider === "github");
  if (!identity || !/^[1-9]\d{0,15}$/.test(identity.id)) return null;
  return Number(identity.id);
}

export type RepoInfo = {
  id: number;
  fullName: string;
  ownerId: number;
  ownerLogin: string;
  private: boolean;
  fork: boolean;
  templateFullName: string | null;
};

export type RepoLookup =
  | { ok: true; repo: RepoInfo }
  | { ok: false; reason: "not_found" | "rate_limited" | "github_error" };

type RepoResponse = {
  id?: unknown;
  full_name?: unknown;
  private?: unknown;
  fork?: unknown;
  owner?: { id?: unknown; login?: unknown };
  template_repository?: { full_name?: unknown } | null;
};

function toRepoInfo(body: RepoResponse): RepoInfo | null {
  const { id, full_name: fullName, owner } = body;
  if (
    typeof id !== "number" ||
    typeof fullName !== "string" ||
    typeof owner?.id !== "number" ||
    typeof owner.login !== "string" ||
    typeof body.private !== "boolean" ||
    typeof body.fork !== "boolean"
  ) {
    return null;
  }
  const template = body.template_repository?.full_name;
  return {
    id,
    fullName,
    ownerId: owner.id,
    ownerLogin: owner.login,
    private: body.private,
    fork: body.fork,
    templateFullName: typeof template === "string" ? template : null,
  };
}

/**
 * `GET /repos/{owner}/{repo}` with the read-only server token. A renamed or transferred repo
 * answers 301; it is followed once, and only to the GitHub API host.
 */
export async function lookupRepo(
  owner: string,
  repo: string,
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<RepoLookup> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "qa-course-platform",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const get = (url: string) => fetchImpl(url, { headers, redirect: "manual", cache: "no-store" });

  const API = githubApiBase();
  try {
    let res = await get(`${API}/repos/${owner}/${repo}`);
    if (res.status === 301) {
      const location = res.headers.get("location");
      if (!location?.startsWith(`${API}/`)) return { ok: false, reason: "github_error" };
      res = await get(location);
    }
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (res.status === 403 || res.status === 429) return { ok: false, reason: "rate_limited" };
    if (!res.ok) return { ok: false, reason: "github_error" };
    const info = toRepoInfo((await res.json()) as RepoResponse);
    return info ? { ok: true, repo: info } : { ok: false, reason: "github_error" };
  } catch {
    return { ok: false, reason: "github_error" };
  }
}

export type RepoRejection = "private" | "fork" | "not_owner";

/** The repo must be public, not a fork, and owned by the linked GitHub account. */
export function checkRepoForLink(repo: RepoInfo, githubId: number): RepoRejection | null {
  if (repo.private) return "private";
  if (repo.fork) return "fork";
  if (repo.ownerId !== githubId) return "not_owner";
  return null;
}
