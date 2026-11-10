// Fake GitHub REST API for E2E tests (GITHUB_API_URL). Only `GET /repos/{owner}/{repo}`.
// Conventions: the owner login `gh<digits>` has owner id <digits>; a repo named `privado` is
// private and `copia` is a fork; the repo id is derived from the names so it is stable.
import { createServer } from "node:http";

const port = Number(process.env.FAKE_GITHUB_PORT ?? 3399);

createServer((req, res) => {
  const match = /^\/repos\/([^/]+)\/([^/]+)$/.exec(req.url ?? "");
  if (req.url === "/health") return res.end("ok");
  if (!match) {
    res.statusCode = 404;
    return res.end("{}");
  }
  const [, owner, repo] = match;
  const ownerId = Number(/^gh(\d+)$/.exec(owner)?.[1] ?? 1);
  if (repo === "no-existe") {
    res.statusCode = 404;
    return res.end("{}");
  }
  const repoId = ownerId * 1000 + [...repo].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 997, 7);
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      id: repoId,
      full_name: `${owner}/${repo}`,
      private: repo === "privado",
      fork: repo === "copia",
      owner: { id: ownerId, login: owner },
      template_repository: null,
    }),
  );
}).listen(port, "127.0.0.1");
