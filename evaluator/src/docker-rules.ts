/**
 * Docker rules (TPL-2c, design §3.8). Pure: they read `facts.files` and the normalized compose
 * model (`facts.composeConfig`, `docker compose config --format json`), never the disk.
 *
 * `compose-seguro` is a pedagogical rule and the precondition of `runDocker`, NOT a security
 * boundary (M8): the student's suite already runs on the runner with access to the Docker
 * socket. Do not import `static-rules.ts` as a value here (it imports this file at load time).
 */
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import type { RepoFacts } from "./facts.ts";
import { parseYamlSafe } from "./yaml-safe.ts";
import type { RuleContext, RuleFn, RuleOutcome, SourceFile } from "./static-rules.ts";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const posix = (p: string) => p.split("\\").join("/");
const list = (items: string[]) => items.slice(0, 3).join("; ") + (items.length > 3 ? "; …" : "");

/** The usable compose model, or null (the dispatcher already turned the other cases into outcomes). */
function modelOf(facts: RepoFacts): Obj | null {
  const c = facts.composeConfig;
  return c && "ok" in c && c.ok && isObj(c.model) ? c.model : null;
}

/** Context and Dockerfile (repo-relative) of the service the criterion runs, from the model. */
export function serviceBuild(
  facts: RepoFacts,
  ctx: RuleContext,
): { context: string; dockerfile: string } | null {
  const service = ctx.compose?.servicio;
  const services = modelOf(facts)?.services;
  const svc = service && isObj(services) ? services[service] : undefined;
  const build = isObj(svc) ? svc.build : undefined;
  if (build === undefined || build === null) return null;
  const b = typeof build === "string" ? { context: build } : isObj(build) ? build : {};
  const rel = (p: string) => posix(isAbsolute(p) ? relative(facts.root, p) : normalize(p));
  const context = rel(typeof b.context === "string" ? b.context : ".");
  const df = typeof b.dockerfile === "string" ? b.dockerfile : "Dockerfile";
  return { context, dockerfile: isAbsolute(df) ? rel(df) : posix(join(context, df)) };
}

const byPath = (files: SourceFile[], path: string) => files.find((f) => f.path === path);

// ---------------------------------------------------------------------------------------------
// docker-imagen-playwright-coincide
// ---------------------------------------------------------------------------------------------

const PLAYWRIGHT_IMAGE =
  /^mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)(?:-(?:noble|jammy|resolute))?(?:@sha256:[0-9a-f]{64})?$/;

/** `FROM [--platform=x] image [AS name]` lines, in order. ARG substitution is NOT followed. */
function fromLines(dockerfile: string): Array<{ image: string; alias: string | null }> {
  const out: Array<{ image: string; alias: string | null }> = [];
  for (const raw of dockerfile.split("\n")) {
    const m = /^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?\s*$/i.exec(raw);
    if (m) out.push({ image: m[1] ?? "", alias: m[2]?.toLowerCase() ?? null });
  }
  return out;
}

/** The base image of the LAST stage (the one that is built), following `FROM <earlier stage>`. */
export function finalBaseImage(dockerfile: string): string | null {
  const froms = fromLines(dockerfile);
  if (!froms.length) return null;
  let i = froms.length - 1;
  const seen = new Set<number>();
  for (;;) {
    const cur = froms[i];
    if (!cur || seen.has(i)) return null;
    seen.add(i);
    const parent = froms.findIndex((f, j) => j < i && f.alias === cur.image.toLowerCase());
    if (parent < 0) return cur.image;
    i = parent;
  }
}

/** Exact `@playwright/test` version of the student's package.json (no range). */
function playwrightVersion(pkg: string): { version: string } | { problem: string } {
  let data: unknown;
  try {
    data = JSON.parse(pkg);
  } catch {
    return { problem: "package.json no es JSON válido" };
  }
  const deps = isObj(data) ? { ...asObj(data.dependencies), ...asObj(data.devDependencies) } : {};
  const v = deps["@playwright/test"];
  if (typeof v !== "string") return { problem: "package.json no declara @playwright/test" };
  if (!/^\d+\.\d+\.\d+$/.test(v))
    return { problem: `@playwright/test debe fijarse a una versión exacta (es «${v}»)` };
  return { version: v };
}
const asObj = (v: unknown): Obj => (isObj(v) ? v : {});

const dockerImagenCoincide: RuleFn = (files, facts, ctx) => {
  const build = serviceBuild(facts, ctx);
  const dfPath = build?.dockerfile ?? files.find((f) => /(^|\/)Dockerfile$/.test(f.path))?.path;
  const df = dfPath ? byPath(files, dfPath) : undefined;
  if (!df)
    return { pass: false, evidence: `No se encontró el Dockerfile${dfPath ? ` (${dfPath})` : ""}` };
  const pkgPath = build ? posix(join(build.context, "package.json")) : "package.json";
  const pkg = byPath(files, "package.json") ?? byPath(files, pkgPath);
  if (!pkg) return { pass: false, evidence: "No se encontró package.json" };
  const pw = playwrightVersion(pkg.content);
  if ("problem" in pw) return { pass: false, evidence: pw.problem };
  const image = finalBaseImage(df.content);
  if (!image) return { pass: false, evidence: `${df.path} no tiene FROM` };
  const m = PLAYWRIGHT_IMAGE.exec(image);
  if (!m)
    return {
      pass: false,
      evidence: `${df.path}: FROM «${image}» no es mcr.microsoft.com/playwright:v${pw.version}-noble`,
    };
  return m[1] === pw.version
    ? { pass: true, evidence: `${image} coincide con @playwright/test ${pw.version}` }
    : {
        pass: false,
        evidence: `La imagen es v${m[1]} pero @playwright/test es ${pw.version}`,
      };
};

// ---------------------------------------------------------------------------------------------
// docker-ignore
// ---------------------------------------------------------------------------------------------

/** True if the `.dockerignore` lines (in order, `!` re-includes) leave `node_modules` ignored. */
export function ignoresNodeModules(content: string): boolean {
  let ignored = false;
  for (const raw of content.split("\n")) {
    const line = raw.trim().replace(/^\/+/, "");
    if (!line || line.startsWith("#")) continue;
    const negated = line.startsWith("!");
    const pattern = (negated ? line.slice(1) : line).replace(/^\/+/, "").replace(/\/+$/, "");
    if (/^(\*\*\/)?node_modules(\/\*\*)?$/.test(pattern) || pattern === "node_modules/*")
      ignored = !negated;
  }
  return ignored;
}

const dockerIgnore: RuleFn = (files, facts, ctx) => {
  const build = serviceBuild(facts, ctx);
  // BuildKit: `<Dockerfile>.dockerignore` wins over `<context>/.dockerignore`.
  const candidates = build
    ? [`${build.dockerfile}.dockerignore`, posix(join(build.context, ".dockerignore"))]
    : [".dockerignore"];
  const file = candidates.map((p) => byPath(files, p)).find((f) => f !== undefined);
  if (!file) return { pass: false, evidence: `No existe ${candidates.at(-1)}` };
  return ignoresNodeModules(file.content)
    ? { pass: true, evidence: `${file.path} ignora node_modules` }
    : { pass: false, evidence: `${file.path} no ignora node_modules` };
};

// ---------------------------------------------------------------------------------------------
// compose-seguro
// ---------------------------------------------------------------------------------------------

const insideRepo = (root: string, p: string) => {
  const rel = relative(resolve(root), resolve(root, p));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

const isSocket = (p: string) => /(^|\/)(docker|containerd|podman)\.sock$/.test(p);

function checkService(name: string, svc: Obj, root: string): string[] {
  const bad: string[] = [];
  const at = (what: string) => bad.push(`${name}: ${what}`);
  const str = (k: string) => (typeof svc[k] === "string" ? (svc[k] as string) : "");
  if (svc.privileged === true) at("privileged: true");
  const net = str("network_mode");
  if (net === "host" || net.startsWith("container:")) at(`network_mode: ${net}`);
  for (const k of ["pid", "userns_mode", "cgroup", "uts"])
    if (str(k) === "host" || str(k).startsWith("container:")) at(`${k}: ${str(k)}`);
  if (str("ipc").startsWith("container:")) at(`ipc: ${str("ipc")}`);
  if (Array.isArray(svc.cap_add) && svc.cap_add.length) at("cap_add");
  if (Array.isArray(svc.devices) && svc.devices.length) at("devices");
  if (Array.isArray(svc.volumes_from) && svc.volumes_from.length) at("volumes_from");
  if (
    Array.isArray(svc.security_opt) &&
    svc.security_opt.some((o) => typeof o === "string" && /unconfined|label[:=]disable/.test(o))
  )
    at("security_opt: unconfined");
  const build = svc.build;
  if (isObj(build) && typeof build.context === "string" && !insideRepo(root, build.context))
    at(`build.context fuera del repo (${build.context})`);
  for (const v of Array.isArray(svc.volumes) ? svc.volumes : []) {
    if (!isObj(v) || v.type !== "bind") continue;
    const source = typeof v.source === "string" ? v.source : "";
    if (isSocket(source)) at(`monta el socket ${source}`);
    else if (!insideRepo(root, source)) at(`volumen bind fuera del repo (${source})`);
  }
  return bad;
}

/** Named volumes whose driver options are a disguised bind mount (`o: bind`, `device: /`). */
function checkVolumes(volumes: unknown, root: string): string[] {
  const bad: string[] = [];
  if (!isObj(volumes)) return bad;
  for (const [name, def] of Object.entries(volumes)) {
    const opts = isObj(def) ? asObj(def.driver_opts) : {};
    const device = typeof opts.device === "string" ? opts.device : null;
    if (device !== null && (isSocket(device) || !isAbsolute(device) || !insideRepo(root, device)))
      bad.push(`volumen ${name}: device ${device} fuera del repo`);
  }
  return bad;
}

/** `secrets` / `configs` with `file:` read host files into the container. */
function checkFileRefs(model: Obj, root: string): string[] {
  const bad: string[] = [];
  for (const section of ["secrets", "configs"]) {
    const entries = model[section];
    if (!isObj(entries)) continue;
    for (const [name, def] of Object.entries(entries)) {
      const file = isObj(def) && typeof def.file === "string" ? def.file : null;
      if (file !== null && !insideRepo(root, file))
        bad.push(`${section}.${name}: ${file} fuera del repo`);
    }
  }
  return bad;
}

/** Remote `include` (git/OCI). `config --format json` resolves local ones, so read the raw YAML (M8). */
function includePaths(doc: unknown): string[] {
  if (!isObj(doc)) return [];
  const inc = doc.include;
  const items = Array.isArray(inc) ? inc : inc === undefined ? [] : [inc];
  return items.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (isObj(item)) {
      const p = item.path;
      return typeof p === "string"
        ? [p]
        : Array.isArray(p)
          ? p.filter((x) => typeof x === "string")
          : [];
    }
    return [];
  });
}

function checkIncludes(files: SourceFile[], facts: RepoFacts, file: string): string[] {
  const bad: string[] = [];
  const visited = new Set<string>();
  const visit = (path: string, depth: number) => {
    if (visited.has(path)) return;
    visited.add(path);
    const f = byPath(files, path);
    if (!f) {
      if (facts.omitted.some((o) => o.path === path)) bad.push(`${path} no se pudo revisar`);
      return;
    }
    const doc = parseYamlSafe(f.content, path);
    if (!doc.ok) {
      bad.push(doc.error);
      return;
    }
    for (const p of includePaths(doc.data)) {
      if (p.includes("://") || p.includes("@") || isAbsolute(p))
        bad.push(`${path}: include «${p}» no es local`);
      else if (depth < 8) visit(posix(join(path, "..", p)), depth + 1);
    }
  };
  visit(posix(normalize(file)), 0);
  return bad;
}

/**
 * Fields that `docker compose config` resolves from the host into the model, so only the raw YAML
 * still shows where they point (M6): `env_file`, `build.network`, `build.additional_contexts`.
 * Also named volumes marked `external` (they live outside the project).
 */
function checkRawCompose(doc: unknown, root: string): string[] {
  const bad: string[] = [];
  if (!isObj(doc)) return bad;
  for (const [name, svc] of Object.entries(asObj(doc.services))) {
    if (!isObj(svc)) continue;
    const envFiles = Array.isArray(svc.env_file)
      ? svc.env_file
      : svc.env_file
        ? [svc.env_file]
        : [];
    for (const e of envFiles) {
      const path = typeof e === "string" ? e : isObj(e) && typeof e.path === "string" ? e.path : "";
      if (path && !insideRepo(root, path)) bad.push(`${name}: env_file fuera del repo (${path})`);
    }
    const build = svc.build;
    if (!isObj(build)) continue;
    if (build.network === "host" || String(build.network ?? "").startsWith("container:"))
      bad.push(`${name}: build.network: ${String(build.network)}`);
    const extra = build.additional_contexts;
    const ctxs = Array.isArray(extra)
      ? extra.map((c) => String(c).split("=").slice(1).join("="))
      : isObj(extra)
        ? Object.values(extra).map(String)
        : [];
    for (const c of ctxs)
      if (
        !c.includes("://") &&
        !c.startsWith("service:") &&
        !c.startsWith("docker-image:") &&
        !insideRepo(root, c)
      )
        bad.push(`${name}: build.additional_contexts fuera del repo (${c})`);
  }
  for (const [name, def] of Object.entries(asObj(doc.volumes)))
    if (isObj(def) && def.external) bad.push(`volumen ${name}: external (vive fuera del proyecto)`);
  return bad;
}

const composeSeguro: RuleFn = (_files, facts, ctx): RuleOutcome => {
  const model = modelOf(facts);
  if (!model) return { error: "No hay modelo de compose" };
  const bad: string[] = [];
  const services = isObj(model.services) ? model.services : {};
  for (const [name, svc] of Object.entries(services))
    if (isObj(svc)) bad.push(...checkService(name, svc, facts.root));
  bad.push(...checkVolumes(model.volumes, facts.root), ...checkFileRefs(model, facts.root));
  // Includes are checked over every readable file, not only the rule scope.
  if (ctx.compose) {
    bad.push(...checkIncludes(facts.files, facts, ctx.compose.archivo));
    const raw = byPath(facts.files, posix(normalize(ctx.compose.archivo)));
    const doc = raw ? parseYamlSafe(raw.content, raw.path) : null;
    if (doc?.ok) bad.push(...checkRawCompose(doc.data, facts.root));
  }
  return bad.length
    ? { pass: false, evidence: list(bad) }
    : { pass: true, evidence: "El compose no usa privilegios, socket ni rutas fuera del repo" };
};

// ---------------------------------------------------------------------------------------------
// docker-un-comando: the `tests` service must really build the student's image and run Playwright
// ---------------------------------------------------------------------------------------------

const SHELLS = new Set(["sh", "bash", "dash", "ash", "zsh"]);
/** Commands a test-run line may start a `&&` segment with (a closed list, A1). */
const RUNNERS = new Set(["npx", "npm", "pnpm", "yarn", "playwright", "corepack", "cd", "export"]);
const NPM_SUBCOMMANDS = new Set(["ci", "install", "i", "run", "run-script", "test", "t", "exec"]);

const basename = (p: string) => p.split("/").at(-1) ?? p;

function toArgs(v: unknown): string[] | null {
  if (Array.isArray(v)) return v.every((x) => typeof x === "string") ? (v as string[]) : null;
  if (typeof v === "string") return ["/bin/sh", "-c", v];
  return null;
}

/** Last ENTRYPOINT / CMD of the Dockerfile (exec form or shell form), `\` continuations joined. */
function dockerfileCommand(dockerfile: string, instruction: "ENTRYPOINT" | "CMD"): string[] | null {
  const joined = dockerfile.replace(/\\\r?\n/g, " ");
  let found: string[] | null = null;
  for (const line of joined.split("\n")) {
    const m = new RegExp(`^\\s*${instruction}\\s+(.*)$`, "i").exec(line);
    if (!m) continue;
    const body = (m[1] ?? "").trim();
    let parsed: unknown;
    try {
      parsed = body.startsWith("[") ? JSON.parse(body) : undefined;
    } catch {
      parsed = undefined;
    }
    found = toArgs(parsed) ?? ["/bin/sh", "-c", body];
  }
  return found;
}

/** The `playwright test` segment of a shell line, or the script it names in package.json. */
function runsPlaywright(segment: string, scripts: Obj): boolean {
  const words = segment.split(/\s+/).filter((w) => !/^\w+=/.test(w));
  const direct = /(^|[\s/])playwright\s+test(\s|$)/.test(words.join(" "));
  const head = basename(words[0] ?? "");
  const viaRunner = ["npx", "npm", "pnpm", "yarn", "playwright"].includes(head);
  if (direct && viaRunner && !/--list\b/.test(segment)) return true;
  const m = /^(?:npm|pnpm|yarn)\s+(?:run(?:-script)?\s+)?([\w:.-]+)\s*$/.exec(words.join(" "));
  const script = m?.[1] === undefined ? undefined : scripts[m[1]];
  // The script gets the same checks (no further indirection).
  return typeof script === "string" && checkTestCommand(["sh", "-c", script]) === null;
}

/**
 * Closed list of static checks on the command the `tests` container ends up running (A1).
 * Returns the problem, or null if it looks like a real Playwright run.
 */
export function checkTestCommand(full: string[], scripts: Obj = {}): string | null {
  if (!full.length) return "el servicio no define comando ni entrypoint (el Dockerfile tampoco)";
  const first = basename(full[0] ?? "");
  const script =
    SHELLS.has(first) && /^-[a-z]*c$/.test(full[1] ?? "")
      ? full.slice(2).join(" ")
      : full.join(" ");
  if (/[;|<>`\n]|\$\(/.test(script) || /(?<!&)&(?!&)/.test(script))
    return "el comando usa operadores de shell (; | & > < `) en vez de lanzar `playwright test`";
  const segments = script
    .split("&&")
    .map((s) => s.trim())
    .filter(Boolean);
  let runs = false;
  for (const segment of segments) {
    const words = segment.split(/\s+/).filter((w) => !/^\w+=/.test(w));
    const head = basename(words[0] ?? "");
    if (!RUNNERS.has(head))
      return `el comando ejecuta «${head}», que no es parte de lanzar Playwright`;
    if (head === "npx") {
      const tool = words.slice(1).find((w) => !w.startsWith("-"));
      if (tool !== "playwright") return `el comando ejecuta «npx ${tool ?? ""}»`;
    }
    if (["npm", "pnpm", "yarn"].includes(head)) {
      const sub = words.slice(1).find((w) => !w.startsWith("-"));
      if (head !== "yarn" && sub !== undefined && !NPM_SUBCOMMANDS.has(sub) && sub !== "dlx")
        return `el comando ejecuta «${head} ${sub}»`;
      if (sub === "exec" || sub === "dlx") {
        const tool = words.slice(words.indexOf(sub) + 1).find((w) => !w.startsWith("-"));
        if (tool !== "playwright") return `el comando ejecuta «${head} ${sub} ${tool ?? ""}»`;
      }
    }
    if (runsPlaywright(segment, scripts)) runs = true;
  }
  return runs ? null : "el comando no ejecuta `playwright test`";
}

/** What the `tests` service runs, from the normalized model and the student's Dockerfile. */
export function testsServiceProblem(
  files: SourceFile[],
  facts: RepoFacts,
  ctx: RuleContext,
): string | null {
  const name = ctx.compose?.servicio;
  const services = modelOf(facts)?.services;
  const svc = name && isObj(services) ? services[name] : undefined;
  if (!isObj(svc)) return `el compose no define el servicio ${name ?? "tests"}`;
  const build = serviceBuild(facts, ctx);
  if (!build)
    return `el servicio ${name} no tiene build: debe construirse con tu Dockerfile, no usar una imagen ajena`;
  const df = byPath(files, build.dockerfile)?.content ?? "";
  const hasEntrypoint = svc.entrypoint !== undefined && svc.entrypoint !== null;
  const entry = hasEntrypoint ? toArgs(svc.entrypoint) : dockerfileCommand(df, "ENTRYPOINT");
  const cmd =
    svc.command !== undefined && svc.command !== null
      ? toArgs(svc.command)
      : hasEntrypoint
        ? []
        : dockerfileCommand(df, "CMD");
  const pkg =
    byPath(files, posix(join(build.context, "package.json"))) ?? byPath(files, "package.json");
  const scripts = ((): Obj => {
    try {
      return pkg ? asObj(asObj(JSON.parse(pkg.content) as unknown).scripts) : {};
    } catch {
      return {};
    }
  })();
  const problem = checkTestCommand([...(entry ?? []), ...(cmd ?? [])], scripts);
  return problem === null ? null : `${name}: ${problem}`;
}

/** Absolute container directories where the tests may live: working_dir, WORKDIR, bind targets. */
export function containerDirs(files: SourceFile[], facts: RepoFacts, ctx: RuleContext): string[] {
  const name = ctx.compose?.servicio;
  const services = modelOf(facts)?.services;
  const svc = name && isObj(services) ? services[name] : undefined;
  if (!isObj(svc)) return [];
  const out: string[] = [];
  if (typeof svc.working_dir === "string") out.push(svc.working_dir);
  const build = serviceBuild(facts, ctx);
  const df = build ? byPath(files, build.dockerfile)?.content : undefined;
  let cwd = "/";
  for (const m of df?.matchAll(/^\s*WORKDIR\s+(\S+)\s*$/gim) ?? []) {
    const dir = m[1] ?? "/";
    cwd = dir.startsWith("/") ? dir : posix(join(cwd, dir));
  }
  if (df && /^\s*WORKDIR\s/im.test(df)) out.push(cwd);
  for (const v of Array.isArray(svc.volumes) ? svc.volumes : [])
    if (isObj(v) && typeof v.target === "string") out.push(v.target);
  return out.map((d) => posix(normalize(d)).replace(/\/+$/, "") || "/");
}

export const DOCKER_RULES = {
  "docker-imagen-playwright-coincide": dockerImagenCoincide,
  "docker-ignore": dockerIgnore,
  "compose-seguro": composeSeguro,
} satisfies Record<string, RuleFn>;

/** Bind-mount sources (absolute) of the model, for the runtime symlink check of `runDocker`. */
export function bindSources(model: unknown): string[] {
  const services = isObj(model) && isObj(model.services) ? model.services : {};
  return Object.values(services).flatMap((svc) =>
    isObj(svc) && Array.isArray(svc.volumes)
      ? svc.volumes.flatMap((v) =>
          isObj(v) && v.type === "bind" && typeof v.source === "string" ? [v.source] : [],
        )
      : [],
  );
}
