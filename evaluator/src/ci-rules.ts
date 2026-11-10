/**
 * `ci-*` static rules over the student's workflows (design §3.6). Pure: they only read the
 * parsed YAML (never regex over raw text, so comments cannot satisfy a rule) and the facts the
 * caller collected. The evaluator never runs a `run:` of the student.
 */
import type { RepoFacts } from "./facts.ts";
import type { RuleFn, RuleOutcome, SourceFile } from "./static-rules.ts";
import { parseYamlSafe } from "./yaml-safe.ts";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const strList = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];

/** An expression-free `${{ … }}` unwrapped and trimmed. */
const bare = (v: unknown) =>
  String(v ?? "")
    .trim()
    .replace(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/, "$1")
    .trim();

type Val = boolean | number | string | null | undefined;
/** What the evaluator knows of `github.*` for a run started by `event` (undefined = unknowable here). */
function contextOf(event: string, name: string): Val {
  if (name === "github.event_name") return event;
  if (event === "pull_request") {
    if (name === "github.ref") return "refs/pull/1/merge";
    if (name === "github.ref_name") return "1/merge";
    if (name === "github.base_ref") return "main";
    if (name === "github.ref_type") return "branch";
  }
  return undefined;
}

/**
 * Three-valued evaluation of a GitHub expression with only literals, `!`, `==`, `!=`, `&&`, `||`,
 * a few `github.*` values and `success()/always()/cancelled()`. Anything else is `undefined`
 * ("depends on the run"), so an opaque condition is never taken as false (no false positives).
 */
function evalExpr(source: string, event: string): Val {
  const tokens = source.match(
    /'(?:[^']|'')*'|[A-Za-z_][\w.-]*(?:\(\))?|\d+(?:\.\d+)?|==|!=|&&|\|\||[!()]|\S/g,
  );
  if (!tokens) return undefined;
  let i = 0;
  const peek = () => tokens[i];
  const truthy = (v: Val): boolean | undefined => (v === undefined ? undefined : Boolean(v));
  const loose = (a: Val, b: Val) => {
    if (typeof a === typeof b)
      return typeof a === "string" ? a.toLowerCase() === (b as string).toLowerCase() : a === b;
    const n = (v: Val) => (v === null ? 0 : typeof v === "boolean" ? Number(v) : Number(v));
    return n(a) === n(b);
  };
  function primary(): Val {
    const t = tokens![i++];
    if (t === undefined) throw new Error("end");
    if (t === "(") {
      const v = or();
      if (tokens![i++] !== ")") throw new Error("paren");
      return v;
    }
    if (t === "!") {
      const v = truthy(primary());
      return v === undefined ? undefined : !v;
    }
    if (t.startsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
    if (/^\d/.test(t)) return Number(t);
    if (t === "true") return true;
    if (t === "false") return false;
    if (t === "null") return null;
    if (t === "success()" || t === "always()") return true;
    if (t === "cancelled()") return false;
    if (/^github\./.test(t)) return contextOf(event, t);
    return undefined;
  }
  function cmp(): Val {
    let l = primary();
    while (peek() === "==" || peek() === "!=") {
      const op = tokens![i++];
      const r = primary();
      l = l === undefined || r === undefined ? undefined : op === "==" ? loose(l, r) : !loose(l, r);
    }
    return l;
  }
  function and(): Val {
    let l = cmp();
    while (peek() === "&&") {
      i++;
      const r = cmp();
      const a = truthy(l);
      const b = truthy(r);
      l = a === false ? l : a === true ? r : b === false ? r : undefined;
    }
    return l;
  }
  function or(): Val {
    let l = and();
    while (peek() === "||") {
      i++;
      const r = and();
      const a = truthy(l);
      const b = truthy(r);
      l = a === true ? l : a === false ? r : b === true ? r : undefined;
    }
    return l;
  }
  try {
    const v = or();
    return i === tokens.length ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `always`: true for every trigger of the workflow; `never`: false for every one (the job or step
 * cannot run: `false`, `1 == 2`, `github.event_name == 'push'` in a PR-only workflow…); else `maybe`.
 */
function condition(v: unknown, events: string[]): "always" | "never" | "maybe" {
  if (v === undefined || v === null) return "always";
  const raw = String(v).trim();
  // Text mixed with several expressions is not a plain condition: do not guess.
  if (/\$\{\{/.test(raw) && !/^\$\{\{[\s\S]*\}\}$/.test(raw)) return "maybe";
  const src = bare(v);
  const names = events.length ? events : ["pull_request"];
  const outs = names.map((e) => evalExpr(src, e));
  const t = outs.map((o) => (o === undefined ? undefined : Boolean(o)));
  if (t.every((o) => o === true)) return "always";
  if (t.every((o) => o === false)) return "never";
  return "maybe";
}
const neverRuns = (v: unknown, events: string[]) => condition(v, events) === "never";
/** `continue-on-error: true`, also as `${{ 1 == 1 }}` (A3). */
const isTrue = (v: unknown, events: string[]) =>
  v !== undefined && v !== null && condition(v, events) === "always";
/** The condition keeps the job running after a failed `needs`, or after a failure. */
const runsAnyway = (v: unknown) => /\b(always|failure|cancelled)\(\)/.test(String(v ?? ""));

interface Step {
  events: string[];
  run: string | null;
  uses: string | null;
  cond: unknown;
  coe: boolean;
  env: Obj;
}
interface Job {
  id: string;
  events: string[];
  name: string | null;
  needs: string[];
  cond: unknown;
  coe: boolean;
  env: Obj;
  environment: string | null;
  uses: string | null;
  permissions: unknown;
  steps: Step[];
}
interface Workflow {
  path: string;
  triggers: Map<string, unknown>;
  env: Obj;
  permissions: unknown;
  hasPermissions: boolean;
  jobs: Job[];
  /** The course's own `evaluar.yml` (it calls the evaluator): not the student's pipeline. */
  evaluator: boolean;
  /** GitHub rejects the whole file: a cycle in `needs`, or a `needs` on a job that does not exist. */
  broken: string | null;
}

function triggersOf(on: unknown): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (typeof on === "string") out.set(on, null);
  else if (Array.isArray(on)) {
    for (const e of on) if (typeof e === "string") out.set(e, null);
  } else if (isObj(on)) {
    for (const [k, v] of Object.entries(on)) out.set(k, v);
  }
  return out;
}

function stepOf(raw: unknown, events: string[]): Step {
  const s = isObj(raw) ? raw : {};
  return {
    events,
    run: str(s.run),
    uses: str(s.uses),
    cond: s.if,
    coe: isTrue(s["continue-on-error"], events),
    env: isObj(s.env) ? s.env : {},
  };
}

function jobOf(id: string, raw: unknown, events: string[]): Job {
  const j = isObj(raw) ? raw : {};
  const env = j.environment;
  return {
    id,
    events,
    name: str(j.name),
    needs: strList(j.needs),
    cond: j.if,
    coe: isTrue(j["continue-on-error"], events),
    env: isObj(j.env) ? j.env : {},
    environment:
      (typeof env === "string" ? env : isObj(env) ? str(env.name) : null)?.trim() || null,
    uses: str(j.uses),
    permissions: j.permissions,
    steps: Array.isArray(j.steps) ? j.steps.map((x) => stepOf(x, events)) : [],
  };
}

function hasCycleOrGhost(jobs: Job[]): string | null {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  for (const j of jobs)
    for (const n of j.needs)
      if (!byId.has(n)) return `el job «${j.id}» depende de «${n}», que no existe`;
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 2) return false;
    if (state.get(id) === 1) return true;
    state.set(id, 1);
    const cyc = (byId.get(id)?.needs ?? []).some(visit);
    state.set(id, 2);
    return cyc;
  };
  return jobs.some((j) => visit(j.id)) ? "los jobs se esperan en círculo (`needs` circular)" : null;
}

type Loaded = { workflows: Workflow[]; scripts: Scripts } | { outcome: RuleOutcome };

/** `scripts` of the root package.json: null = there is none (or it is unreadable). */
type Scripts = Record<string, string> | null;
const WORKFLOW_FILE = /^\.github\/workflows\/[^/]+\.ya?ml$/;

function scriptsOf(files: SourceFile[]): Scripts {
  const f = files.find((x) => x.path === "package.json");
  if (!f) return null;
  try {
    const pkg = JSON.parse(f.content) as unknown;
    const sc = isObj(pkg) && isObj(pkg.scripts) ? pkg.scripts : {};
    return Object.fromEntries(
      Object.entries(sc).filter((e): e is [string, string] => typeof e[1] === "string"),
    );
  } catch {
    return null;
  }
}

const isEvaluator = (jobs: Job[]) =>
  jobs.some(
    (j) =>
      j.uses?.includes("qa-course-evaluator/") ||
      j.steps.some((s) => s.uses?.includes("qa-course-evaluator/")),
  );

/** Parses every workflow with the evaluator's single YAML reader. Invalid YAML is the student's fault. */
function load(files: SourceFile[]): Loaded {
  const workflows: Workflow[] = [];
  const scripts = scriptsOf(files);
  for (const f of [...files]
    .filter((x) => WORKFLOW_FILE.test(x.path))
    .sort((a, b) => a.path.localeCompare(b.path))) {
    const parsed = parseYamlSafe(f.content, f.path);
    if (!parsed.ok) return { outcome: { pass: false, evidence: parsed.error } };
    const doc = isObj(parsed.data) ? parsed.data : {};
    const jobsRaw = isObj(doc.jobs) ? doc.jobs : {};
    const triggers = triggersOf(doc.on);
    const events = [...triggers.keys()];
    const jobs = Object.entries(jobsRaw).map(([id, j]) => jobOf(id, j, events));
    workflows.push({
      path: f.path,
      triggers,
      env: isObj(doc.env) ? doc.env : {},
      permissions: doc.permissions,
      hasPermissions: "permissions" in doc,
      jobs,
      evaluator: isEvaluator(jobs),
      broken: hasCycleOrGhost(jobs),
    });
  }
  return { workflows, scripts };
}

/** Jobs that GitHub would really run: not `if: false`, not behind a dead `needs`, file not broken. */
function liveJobs(wf: Workflow, event?: string): Set<string> {
  const byId = new Map(wf.jobs.map((j) => [j.id, j]));
  const memo = new Map<string, boolean>();
  const live = (id: string): boolean => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    const j = byId.get(id);
    let ok = false;
    if (j && !wf.broken && !neverRuns(j.cond, event ? [event] : j.events))
      ok = runsAnyway(j.cond) || j.needs.every((n) => live(n));
    memo.set(id, ok);
    return ok;
  };
  return new Set(wf.jobs.filter((j) => live(j.id)).map((j) => j.id));
}

interface Ctx {
  wf: Workflow;
  job: Job;
}

/** Live jobs of the student's workflows that have at least one trigger. */
function activeJobs(workflows: Workflow[], event?: string): Ctx[] {
  return workflows
    .filter((w) => !w.evaluator && w.triggers.size > 0)
    .flatMap((wf) => {
      const live = liveJobs(wf, event);
      return wf.jobs.filter((j) => live.has(j.id)).map((job) => ({ wf, job }));
    });
}

const studentOf = (workflows: Workflow[]) => workflows.filter((w) => !w.evaluator);
const noStudent: RuleOutcome = {
  pass: false,
  evidence: "No hay ningún workflow propio en .github/workflows/",
};

/** Steps that run for real and whose failure fails the job. */
const effectiveSteps = (job: Job) =>
  job.steps.filter((s) => !neverRuns(s.cond, s.events) && !s.coe);

/** After a `||`, only `exit N` (N != 0) or `false` keep the failure; anything else swallows it. */
function swallowed(text: string): boolean {
  const plain = text.replace(/"[^"]*"|'[^']*'/g, "''");
  return plain.split(/&&|;/).some((part) => {
    const at = part.indexOf("||");
    return at >= 0 && !/^\s*(exit(\s+[1-9]\d*)?|false)\s*$/.test(part.slice(at + 2));
  });
}

/** Shell commands of a `run`: comments dropped, `a && b` split, a swallowed failure marks them as non-failing. */
function commandsOf(run: string): { text: string; failsJob: boolean }[] {
  const out: { text: string; failsJob: boolean }[] = [];
  for (const line of run.replace(/\\\r?\n/g, " ").split(/\r?\n/)) {
    let l = line.trim();
    if (l.startsWith("#")) continue;
    if (!/["']/.test(l)) l = l.replace(/\s#.*$/, "");
    // Whatever follows an unconditional `exit 0` never runs.
    if (/^exit(\s+0)?\s*$/.test(l)) break;
    for (const part of l.split(/&&|;/)) {
      const text = part.trim();
      if (text && !/^(echo|printf|cat)\b/.test(text)) out.push({ text, failsJob: !swallowed(l) });
    }
  }
  return out;
}

const GREP = /(--grep(=|\s+)|\s-g\s+)/;
const SMOKE = /(--grep(=|\s+)|\s-g\s+)["']?@smoke\b/;
/** Flags with which the command can end green without running a test. */
const NO_REAL_RUN =
  /(^|\s)(--list|--pass-with-no-tests|--grep-invert|-gv|--last-failed|--only-changed)(?=[\s=]|$)/;
const PLAYWRIGHT = /(^|[\s(])playwright\s+test\b/;
const COMPOSE_SUITE =
  /\bdocker(?:\s+|-)compose\b[^|]*?(?:\bup\b[^|]*--exit-code-from|\brun\b[^|]*\b(?:tests?|e2e|playwright)\b)/i;
const NPM_SCRIPT = /^(?:npm|pnpm|yarn)(?:\s+run)?\s+([\w:.-]+)(.*)$/;

/** `npm run e2e -- --grep @smoke` -> the body of the `e2e` script plus the extra arguments. */
function expandScript(text: string, scripts: Scripts, depth = 0): string {
  const m = NPM_SCRIPT.exec(text);
  const body = m && scripts ? scripts[m[1]!] : undefined;
  if (!m || body === undefined || depth > 3) return text;
  return `${expandScript(body, scripts, depth + 1)} ${m[2]!.replace(/^\s*--\s*/, "")}`.trim();
}

/**
 * The command text (npm scripts resolved in `package.json`) if it really runs Playwright tests and
 * its failure fails the job; null otherwise. A `package.json` without that script, `--list`,
 * `--pass-with-no-tests`, `--grep-invert` or a swallowed failure (`|| echo`) do not count.
 */
function suiteText(c: { text: string; failsJob: boolean }, scripts: Scripts): string | null {
  if (!c.failsJob) return null;
  const x = expandScript(c.text, scripts);
  const legacyTest = scripts === null && /^(npm|pnpm|yarn)\s+(run\s+)?test\b/.test(c.text);
  if (!(PLAYWRIGHT.test(x) || COMPOSE_SUITE.test(x) || legacyTest)) return null;
  if (NO_REAL_RUN.test(x) || swallowed(x)) return null;
  return x;
}

const suiteCommands = (job: Job, scripts: Scripts) =>
  effectiveSteps(job).flatMap((s) =>
    s.run
      ? commandsOf(s.run).flatMap((c) => {
          const text = suiteText(c, scripts);
          return text === null ? [] : [{ text }];
        })
      : [],
  );

/** `a` waits (transitively) for `b` and a failure of `b` really stops `a`. */
function gatedBy(wf: Workflow, from: Job, target: Job): boolean {
  const byId = new Map(wf.jobs.map((j) => [j.id, j]));
  const seen = new Set<string>();
  const walk = (j: Job): boolean => {
    if (runsAnyway(j.cond)) return false;
    return j.needs.some((n) => {
      if (n === target.id) return true;
      const next = byId.get(n);
      if (!next || seen.has(n) || next.coe) return false;
      seen.add(n);
      return walk(next);
    });
  };
  return walk(from);
}

function globToRegExp(pattern: string): RegExp {
  const re = pattern
    .split("**")
    .map((p) => p.split("*").map(escape).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${re}$`);
}
function escape(s: string) {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/** Does a `branches`/`branches-ignore` filter of `pull_request` let `main` through? */
function coversMain(config: unknown): string | null {
  if (!isObj(config)) return null;
  const types = config.types;
  if (types !== undefined) {
    const t = strList(types);
    if (!t.includes("opened") && !t.includes("synchronize"))
      return `solo reacciona a ${t.join(", ") || "ningún tipo de evento"}, no al abrir o actualizar un PR`;
  }
  if (config.branches !== undefined) {
    let matched = false;
    for (const p of strList(config.branches)) {
      if (p.startsWith("!")) {
        if (globToRegExp(p.slice(1)).test("main")) matched = false;
      } else if (globToRegExp(p).test("main")) matched = true;
    }
    if (!matched) return "su filtro `branches` no incluye main";
  }
  if (strList(config["branches-ignore"]).some((p) => globToRegExp(p).test("main")))
    return "su filtro `branches-ignore` excluye main";
  return null;
}

const prTrigger = (w: Workflow) => w.triggers.get("pull_request");

/**
 * Does a `paths` filter of `pull_request` match some file of the repo? A filter nobody can match
 * (`no-existe/**`) means the CI never starts (A3). Only decided when the file list is complete:
 * files the reader dropped by the cap, or binary ones, make it "unknown" and the filter passes.
 */
function pathsNeverMatch(config: unknown, facts: RepoFacts): string | null {
  if (!isObj(config)) return null;
  const patterns = strList(config.paths);
  if (!patterns.length || facts.omitted.some((o) => o.reason === "limit")) return null;
  const known = facts.files.map((f) => f.path);
  const lastMatch = (file: string) => {
    let state = false;
    for (const p of patterns) {
      const neg = p.startsWith("!");
      if (globToRegExp(neg ? p.slice(1) : p).test(file)) state = !neg;
    }
    return state;
  };
  if (known.some(lastMatch) || facts.omitted.some((o) => lastMatch(o.path))) return null;
  // A literal directory that exists with files we could not list (binary): unknown, not a fail.
  const dirs = patterns
    .filter((p) => !p.startsWith("!"))
    .map((p) => p.split(/[*?[]/)[0]!.replace(/[^/]*$/, ""));
  if (dirs.some((d) => d && known.some((k) => k.startsWith(d)))) return null;
  return `su filtro \`paths\` (${patterns.slice(0, 3).join(", ")}) no coincide con ningún archivo del repositorio: el CI nunca arrancaría`;
}

export const ciDisparaEnPr: RuleFn = (files, facts) => {
  const loaded = load(files);
  if ("outcome" in loaded) return loaded.outcome;
  const mine = studentOf(loaded.workflows);
  if (!mine.length) return noStudent;
  const reasons: string[] = [];
  for (const wf of mine) {
    if (!wf.triggers.has("pull_request")) {
      reasons.push(`${wf.path} no se dispara con pull_request`);
      continue;
    }
    const why = coversMain(prTrigger(wf)) ?? pathsNeverMatch(prTrigger(wf), facts);
    if (why) {
      reasons.push(`${wf.path}: ${why}`);
      continue;
    }
    if (wf.broken) {
      reasons.push(`${wf.path} no es válido: ${wf.broken}`);
      continue;
    }
    if (!liveJobs(wf, "pull_request").size) {
      reasons.push(`${wf.path} no tiene ningún job que llegue a ejecutarse`);
      continue;
    }
    return { pass: true, evidence: `${wf.path} se ejecuta en cada PR a main` };
  }
  return { pass: false, evidence: reasons.slice(0, 3).join("; ") };
};

export const ciSinPullRequestTarget: RuleFn = (files) => {
  const loaded = load(files);
  if ("outcome" in loaded) return loaded.outcome;
  const bad = loaded.workflows.filter((w) => w.triggers.has("pull_request_target"));
  return bad.length
    ? {
        pass: false,
        evidence: `${bad.map((w) => w.path).join(", ")} usa pull_request_target (corre código de forks con permisos)`,
      }
    : { pass: true, evidence: "Ningún workflow usa pull_request_target" };
};

/** `contents: write` (or `write-all`) anywhere in a permissions value. */
const writesContents = (p: unknown) =>
  p === "write-all" || (isObj(p) && String(p.contents).trim() === "write");

export const ciPermisosMinimos: RuleFn = (files) => {
  const loaded = load(files);
  if ("outcome" in loaded) return loaded.outcome;
  const mine = studentOf(loaded.workflows);
  if (!mine.length) return noStudent;
  for (const wf of mine) {
    const p = wf.permissions;
    if (!wf.hasPermissions || !(isObj(p) || p === "read-all"))
      return {
        pass: false,
        evidence: `${wf.path} no declara \`permissions\` en la raíz como un mapa (p. ej. contents: read)`,
      };
    if (writesContents(p) || wf.jobs.some((j) => writesContents(j.permissions)))
      return { pass: false, evidence: `${wf.path} da permisos de escritura sobre el contenido` };
  }
  return { pass: true, evidence: "Permisos mínimos declarados en cada workflow" };
};

export const ciArtefactosSiempre: RuleFn = (files) => {
  const loaded = load(files);
  if ("outcome" in loaded) return loaded.outcome;
  const mine = studentOf(loaded.workflows);
  if (!mine.length) return noStudent;
  for (const { wf, job } of activeJobs(mine)) {
    const step = job.steps.find(
      (s) =>
        /^actions\/upload-artifact@/.test(s.uses ?? "") &&
        !neverRuns(s.cond, s.events) &&
        /\b(always|failure)\(\)|!\s*cancelled\(\)/.test(String(s.cond ?? "")),
    );
    if (step) return { pass: true, evidence: `${wf.path} sube el informe en el job «${job.id}»` };
  }
  return {
    pass: false,
    evidence:
      "Ningún paso actions/upload-artifact con `if: always()` (o `!cancelled()`/`failure()`) en un job que se ejecute",
  };
};

/** Names that hold a credential: a literal value in the workflow is a leaked secret. */
const SECRET_NAME = /(CLAVE|PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY)/i;

/** `echo "K=…" >> $GITHUB_ENV` / `printf … >> "${GITHUB_ENV}"`: the lines that export a variable to later steps. */
const ENV_EXPORT = /(\bGITHUB_ENV\b)/;

interface EnvSecret {
  literal?: string;
  secret: boolean;
}

/** Variables a step exports through `$GITHUB_ENV`, and whether their value is a secret or a literal credential. */
function exportedEnv(step: Step, inherited: Obj): Map<string, EnvSecret> {
  const out = new Map<string, EnvSecret>();
  if (!step.run) return out;
  const env = { ...inherited, ...step.env };
  for (const line of step.run.replace(/\\\r?\n/g, " ").split(/\r?\n/)) {
    if (!ENV_EXPORT.test(line) || !/>>/.test(line)) continue;
    const m = /(?:echo|printf)\s+(?:-[a-zA-Z]+\s+)?["']?([A-Za-z_]\w*)=([^>]*?)["']?\s*>>/.exec(
      line,
    );
    if (!m) continue;
    const value = m[2]!.trim().replace(/["']$/, "");
    const ref = /^\$\{?([A-Za-z_]\w*)\}?$/.exec(value);
    const viaEnv = ref ? String(env[ref[1]!] ?? "") : "";
    const secret = /\$\{\{\s*secrets\./.test(value) || /\$\{\{\s*secrets\./.test(viaEnv);
    const literal = !secret && value && !value.includes("$") ? value : undefined;
    out.set(m[1]!, { secret, ...(literal ? { literal } : {}) });
  }
  return out;
}

export const ciSecretos: RuleFn = (files) => {
  const loaded = load(files);
  if ("outcome" in loaded) return loaded.outcome;
  const mine = studentOf(loaded.workflows);
  if (!mine.length) return noStudent;
  let usesSecret = false;
  for (const { wf, job } of activeJobs(mine)) {
    // Variables exported to later steps with `>> $GITHUB_ENV` (a secret, or a clear-text credential).
    const exported = new Map<string, EnvSecret>();
    for (const s of effectiveSteps(job)) {
      if (!s.run) continue;
      const suite = commandsOf(s.run).some((c) => suiteText(c, loaded.scripts) !== null);
      if (suite) {
        const env = { ...wf.env, ...job.env, ...s.env };
        for (const [k, v] of Object.entries(env)) {
          const text = String(v ?? "");
          if (SECRET_NAME.test(k) && text.trim() && !text.includes("${{"))
            return {
              pass: false,
              evidence: `${wf.path}: ${k} está escrito en claro; usa \${{ secrets.… }}`,
            };
          if (/\$\{\{\s*secrets\./.test(text)) usesSecret = true;
        }
        for (const [k, e] of exported) {
          if (e.literal && SECRET_NAME.test(k))
            return {
              pass: false,
              evidence: `${wf.path}: ${k} se exporta en claro a $GITHUB_ENV; usa \${{ secrets.… }}`,
            };
          if (e.secret) usesSecret = true;
        }
      }
      for (const [k, e] of exportedEnv(s, { ...wf.env, ...job.env })) exported.set(k, e);
    }
  }
  return usesSecret
    ? { pass: true, evidence: "Las pruebas reciben sus credenciales desde secrets" }
    : {
        pass: false,
        evidence:
          "Ningún paso que ejecuta las pruebas recibe un valor de `${{ secrets.… }}` en env (ni por `$GITHUB_ENV` desde un paso anterior)",
      };
};

export const ciHumoTrasDespliegue: RuleFn = (files) => {
  const loaded = load(files);
  if ("outcome" in loaded) return loaded.outcome;
  const mine = studentOf(loaded.workflows);
  if (!mine.length) return noStudent;
  const active = activeJobs(mine);
  let sawSmoke = false;
  for (const { wf, job } of active) {
    if (!job.environment || job.coe) continue;
    const smoke = suiteCommands(job, loaded.scripts).some((c) => SMOKE.test(c.text));
    if (!smoke) continue;
    sawSmoke = true;
    const gate = active.find(
      (o) =>
        o.wf === wf &&
        o.job !== job &&
        !o.job.coe &&
        suiteCommands(o.job, loaded.scripts).some((c) => !GREP.test(c.text)) &&
        gatedBy(wf, job, o.job),
    );
    if (gate)
      return {
        pass: true,
        evidence: `${wf.path}: «${job.id}» (environment ${job.environment}) corre @smoke tras «${gate.job.id}»`,
      };
  }
  return {
    pass: false,
    evidence: sawSmoke
      ? "El job con `environment` que corre @smoke no espera (needs) a un job que ejecute la suite completa"
      : "Ningún job con `environment` ejecuta `--grep @smoke`",
  };
};

export const ciActionlint: RuleFn = (files, facts) => {
  const a = facts.actionlint;
  if (!a) return { error: "No se obtuvo el dato «actionlint»" };
  if ("error" in a) return { error: a.error };
  const loaded = load(files);
  if ("outcome" in loaded) return loaded.outcome;
  if (!studentOf(loaded.workflows).length) return noStudent;
  if (a.ok && !a.findings.length)
    return { pass: true, evidence: "actionlint no encontró problemas" };
  const shown = a.findings.slice(0, 3).join(" | ");
  return { pass: false, evidence: `actionlint: ${shown}${a.findings.length > 3 ? " …" : ""}` };
};

/** GitHub names a check after the job's `name`, or its id; a matrix appends « (valores)». */
function contextMatches(context: string, job: Job): boolean {
  const names = [job.id, job.name].filter((n): n is string => !!n);
  return names.some((n) => {
    const re = n
      .split(/\$\{\{[\s\S]*?\}\}/)
      .map(escape)
      .join(".*");
    return new RegExp(`^${re}( \\(.*\\))?$`).test(context);
  });
}

export const ciRamaProtegida: RuleFn = (files, facts) => {
  const g = facts.github;
  if (!g) return { error: "No se obtuvo el dato «github»" };
  if ("error" in g) return { error: g.error };
  if (!g.requiredContexts.length)
    return { pass: false, evidence: "La rama main no exige ningún check para fusionar" };
  const loaded = load(files);
  if ("outcome" in loaded) return loaded.outcome;
  const mine = studentOf(loaded.workflows).filter(
    (w) =>
      w.triggers.has("pull_request") &&
      !coversMain(prTrigger(w)) &&
      !pathsNeverMatch(prTrigger(w), facts),
  );
  for (const { job } of activeJobs(mine, "pull_request")) {
    // The check must come from a job that really runs the suite, not just share the name.
    if (!suiteCommands(job, loaded.scripts).length) continue;
    const hit = g.requiredContexts.find((c) => contextMatches(c, job));
    if (hit) return { pass: true, evidence: `main exige el check «${hit}» (job «${job.id}»)` };
  }
  return {
    pass: false,
    evidence: `main exige ${g.requiredContexts.slice(0, 3).join(", ")}, pero ningún job de tu CI en PR que ejecute la suite se llama así`,
  };
};

/** Workflow path as the API reports it (`.github/workflows/ci.yml`, sometimes with `@refs/…`). */
const runPath = (p: string) => p.replace(/@.*$/, "");

/**
 * `ci-ejecucion-real` (A3): the one fact of BEHAVIOUR. GitHub says that a workflow of the student,
 * triggered by a `pull_request`, ran to the end and a job that today runs the full suite concluded
 * `success` (not `skipped`). It judges jobs, not the run: the course's own deployment step runs
 * the broken release on purpose, so a good run can end `failure` because of the smoke job. It is
 * not asked of THIS commit (Q5: the student's CI and the evaluator start with the same push).
 */
export const ciEjecucionReal: RuleFn = (files, facts) => {
  const g = facts.githubRuns;
  if (!g) return { error: "No se obtuvo el dato «githubRuns»" };
  if ("error" in g) return { error: g.error };
  const loaded = load(files);
  if ("outcome" in loaded) return loaded.outcome;
  const mine = studentOf(loaded.workflows).filter((w) => w.triggers.has("pull_request"));
  if (!studentOf(loaded.workflows).length) return noStudent;
  const hint =
    "abre un pull request, espera a que tu job de pruebas termine en verde y vuelve a enviar";
  if (!g.runs.length)
    return {
      pass: false,
      evidence: `GitHub no muestra ninguna ejecución de tu CI en un pull request: ${hint}`,
    };
  for (const run of g.runs) {
    if (run.event !== "pull_request") continue;
    const wf = mine.find((w) => w.path === runPath(run.path));
    if (!wf || wf.broken) continue;
    const live = liveJobs(wf, "pull_request");
    for (const job of wf.jobs) {
      if (!live.has(job.id) || job.coe) continue;
      // The FULL suite (no --grep): the smoke job after the deploy is judged by its own rule.
      if (!suiteCommands(job, loaded.scripts).some((c) => !GREP.test(c.text))) continue;
      const ran = run.jobs.find((j) => contextMatches(j.name, job));
      if (ran?.conclusion === "success")
        return {
          pass: true,
          evidence: `GitHub registra la ejecución #${run.id} de ${wf.path} en un PR con el job «${job.id}» en verde`,
        };
    }
  }
  return {
    pass: false,
    evidence: `Ninguna de las ${g.runs.length} ejecuciones recientes de tu CI en un PR tiene en verde (success, no skipped) un job que ejecute la suite: ${hint}`,
  };
};

export const CI_RULES = {
  "ci-dispara-en-pr": ciDisparaEnPr,
  "ci-sin-pull-request-target": ciSinPullRequestTarget,
  "ci-permisos-minimos": ciPermisosMinimos,
  "ci-artefactos-siempre": ciArtefactosSiempre,
  "ci-secretos": ciSecretos,
  "ci-humo-tras-despliegue": ciHumoTrasDespliegue,
  "ci-actionlint": ciActionlint,
  "ci-rama-protegida": ciRamaProtegida,
  "ci-ejecucion-real": ciEjecucionReal,
} as const satisfies Record<string, RuleFn>;
