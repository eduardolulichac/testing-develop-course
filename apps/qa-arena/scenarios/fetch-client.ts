import type { ArenaClient } from "@course/scenario-engine";

/**
 * `ArenaClient` over `fetch`, for smoke tests against Docker and (E3) the challenge evaluator.
 * `runnerToken` is the evaluator's per-run secret of a runner Arena; it is sent only to `/__arena/*`.
 */
export function fetchClient(baseUrl: string, opts: { runnerToken?: string } = {}): ArenaClient {
  let cookie = "";

  const request: ArenaClient["request"] = async (method, path, o = {}) => {
    const headers: Record<string, string> = {};
    if (o.body !== undefined) headers["content-type"] = "application/json";
    if (o.token) headers.authorization = `Bearer ${o.token}`;
    if (cookie) headers.cookie = cookie;
    if (opts.runnerToken && path.startsWith("/__arena/"))
      headers["x-arena-runner-token"] = opts.runnerToken;
    const res = await fetch(new URL(path, baseUrl), {
      method,
      headers,
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0] ?? cookie;
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // not JSON: keep the raw text
    }
    return { status: res.status, headers: Object.fromEntries(res.headers), body };
  };

  return {
    request,
    async login(email, password) {
      const r = await request("POST", "/api/auth/login", { body: { email, password } });
      if (r.status !== 200) throw new Error(`login failed (${r.status})`);
      return r.body.token as string;
    },
    async setScenario(id, release) {
      const r = await request("PUT", "/__arena/scenario", { body: { id, release } });
      if (r.status !== 200) throw new Error(`setScenario failed (${r.status})`);
    },
    async reset() {
      const r = await request("POST", "/__arena/reset");
      if (r.status !== 200) throw new Error(`reset failed (${r.status})`);
    },
  };
}
