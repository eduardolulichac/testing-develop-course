/** Static rules over the student's files. Pure: the caller collects the facts (see facts.ts). */
import type { StaticRule } from "@course/shared";
import { isAbsolute, join, normalize, relative } from "node:path";
import type { RepoFacts } from "./facts.ts";
import { CI_RULES } from "./ci-rules.ts";
import { DOCKER_RULES } from "./docker-rules.ts";
import { POM_RULES } from "./pom-rules.ts";

export interface SourceFile {
  /** Path relative to the student's repo, with forward slashes. */
  path: string;
  content: string;
}

export type { StaticRule };

/** `{error}` means the evaluator could not decide (missing tool or fact, rule not implemented). */
export type RuleOutcome = { pass: boolean; evidence: string } | { error: string };

/** A file the evaluator did NOT read. A rule whose scope contains it must not pass or fail by omission. */
export interface OmittedFile {
  path: string;
  reason: "size" | "binary" | "limit" | "symlink";
}

export const OMIT_REASON: Record<OmittedFile["reason"], string> = {
  size: "pesa más de 256 KiB",
  binary: "tiene bytes binarios",
  symlink: "es un enlace simbólico",
  limit: "quedó fuera del límite de archivos",
};

/** What the dispatcher builds for the rules (it has the criteria and the phases at hand). */
export interface RuleContext {
  /** Files Playwright ran (`file` of `baseline||`), repo-relative; fallback `*.spec|test.*`. */
  testFiles: string[];
  /** From the `docker_compose` criterion, or `compose.yml`/`tests` if a compose rule is asked. */
  compose: { archivo: string; servicio: string } | null;
}

/** Which of the student's files a rule looks at. */
export type RuleScope =
  "code" | "workflows" | "workflows+scripts" | "docker" | "code+workflows" | "code+workflows+data";

const CODE = /\.(ts|tsx|js|mjs|cjs|mts|cts)$/;
const WORKFLOWS = /^\.github\/workflows\/[^/]+\.ya?ml$/;
/** Test data and secrets files; never lockfiles nor `.env.example`. */
const DATA =
  /^(?!(?:.*\/)?(?:package-lock\.json|pnpm-lock\.yaml)$).*\.(?:json|ya?ml)$|(?:^|\/)\.env(?:\.(?!example$).+)?$/;

export const SCOPES: Record<RuleScope, RegExp> = {
  code: CODE,
  workflows: WORKFLOWS,
  /** Workflows plus the root `package.json`, whose `scripts` the CI rules resolve (`npm run e2e`). */
  "workflows+scripts": new RegExp(`${WORKFLOWS.source}|^package\\.json$`),
  /** Fallback only: with a compose model the rule's files come from the model (see `dockerPaths`). */
  docker:
    /(^|\/)(Dockerfile(\..+)?|[^/]+\.Dockerfile|\.dockerignore|(docker-)?compose(\..+)?\.ya?ml|package\.json)$/,
  "code+workflows": new RegExp(`${CODE.source}|${WORKFLOWS.source}`),
  "code+workflows+data": new RegExp(`${CODE.source}|${WORKFLOWS.source}|${DATA.source}`),
};

/** True if some rule scope would look at the file: the reader must never drop it silently. */
export const inAnyScope = (path: string) => Object.values(SCOPES).some((re) => re.test(path));

export type RuleFn = (files: SourceFile[], facts: RepoFacts, ctx: RuleContext) => RuleOutcome;

/** Drops comments so a rule does not fire on text such as "// no waitForTimeout here". */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

const lines = (found: string[]) => found.slice(0, 3).join(", ") + (found.length > 3 ? ", …" : "");

function findAll(files: SourceFile[], pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const f of files) {
    const code = stripComments(f.content);
    code.split("\n").forEach((line, i) => {
      if (pattern.test(line)) hits.push(`${f.path}:${i + 1}`);
    });
  }
  return hits;
}

/**
 * Identifiers that reveal the scenario without `/__arena` (review C1): the scenario bar of the
 * web, the release header of the API and the ids of the evaluator's own scenarios. It also
 * covers the two ways left to steal the runner Arena's token from the machine (`docker inspect`
 * of the API container, `/proc/<pid>/environ` of the evaluator): residual T2, see
 * `docs/EVALUACION_DISENO.md`.
 */
const ARENA_IDENTIFIERS =
  /scenario-(select|bar|confirm)|release-select|env-(label|banner)|nav-requirements|x-arena-|arena_session|arena-release|eval-\d+-\d+|docker\s+(inspect|exec)|\/proc\/(self|\d)/i;
const ARENA_INTERNALS = /__arena|\bARENA_(?!URL\b)[A-Z_]+/;

/**
 * Undoes the cheap ways of splitting a string literal so the identifier is whole again:
 * `\x2d` / `\u002d` escapes, `"a" + "b"`, `"a".concat("b")`, `${"b"}` inside a template and
 * `["a", "b"].join("")`. Newlines are kept so line numbers stay usable.
 */
export function joinLiterals(source: string): string {
  let code = source.replace(
    /\\x([0-9a-f]{2})|\\u([0-9a-f]{4})|\\u\{([0-9a-f]+)\}/gi,
    (_m, a, b, c) => String.fromCodePoint(parseInt(a ?? b ?? c, 16)),
  );
  for (let i = 0; i < 4; i++) {
    const next = code
      .replace(/(["'`])\s*\+\s*\1/g, "")
      .replace(/(["'`])\s*\.concat\(\s*\1/g, "")
      .replace(/\$\{\s*(["'`])([^"'`\n]*)\1\s*\}/g, "$2")
      .replace(/(["'`])\s*,\s*\1(?=[^\]\n]*\]\s*\.join\(\s*(["'`])\2\s*\))/g, "");
    if (next === code) break;
    code = next;
  }
  return code;
}

function arenaInternalHits(files: SourceFile[]): string[] {
  const hits: string[] = [];
  for (const f of files) {
    const code = joinLiterals(stripComments(f.content));
    code.split("\n").forEach((line, i) => {
      if (ARENA_INTERNALS.test(line) || ARENA_IDENTIFIERS.test(line))
        hits.push(`${f.path}:${i + 1}`);
    });
  }
  return hits;
}

const CODE_RULES: Partial<Record<StaticRule, RuleFn>> = {
  "sin-esperas-fijas": (files) => {
    const hits = findAll(
      files,
      /\bwaitForTimeout\s*\(|\bpage\.pause\s*\(|new Promise\([^)]*setTimeout/,
    );
    return hits.length
      ? { pass: false, evidence: `Esperas fijas en ${lines(hits)}` }
      : { pass: true, evidence: "Sin esperas fijas" };
  },
  "sin-arena-interna": (files) => {
    const hits = arenaInternalHits(files);
    return hits.length
      ? { pass: false, evidence: `Usa partes internas de la Arena en ${lines(hits)}` }
      : { pass: true, evidence: "No usa endpoints ni variables internas de la Arena" };
  },
  "localizadores-por-rol": (files) => {
    const fragile = findAll(files, /\.locator\s*\(|\.\$\$?\s*\(|xpath\s*=|\bcss\s*=/);
    const accessible = findAll(files, /\.getBy(Role|Label|Text|Placeholder|AltText|Title)\s*\(/);
    if (fragile.length)
      return { pass: false, evidence: `Selectores CSS/XPath en ${lines(fragile)}` };
    if (!accessible.length) {
      return { pass: false, evidence: "No se encontró ningún getByRole ni getByLabel" };
    }
    return { pass: true, evidence: `${accessible.length} localizadores accesibles` };
  },
  "sin-only": (files) => {
    const hits = findAll(files, /\b(test|describe)\.only\s*\(/);
    return hits.length
      ? { pass: false, evidence: `.only en ${lines(hits)}` }
      : { pass: true, evidence: "Sin .only" };
  },
};

/** Placeholder until TPL-2a/2b/2c implement the rule: it never passes or fails, it errors. */
const notImplemented: RuleFn = () => ({ error: "sin implementar" });

type ImpureFact = "actionlint" | "github" | "githubRuns" | "composeConfig";

/**
 * Impure facts each rule needs. The dispatcher enforces them: a missing or `{error}` fact is
 * `error` (the evaluator's fault) and the rule is never called, so a rule cannot turn it into
 * `fail` or `pass`.
 */
export const RULE_FACTS: Partial<Record<StaticRule, ImpureFact>> = {
  "ci-actionlint": "actionlint",
  "ci-rama-protegida": "github",
  "ci-ejecucion-real": "githubRuns",
  "docker-imagen-playwright-coincide": "composeConfig",
  "docker-ignore": "composeConfig",
  "compose-seguro": "composeConfig",
};

export const RULE_SCOPES: Record<StaticRule, RuleScope> = {
  "sin-esperas-fijas": "code",
  "sin-arena-interna": "code",
  "localizadores-por-rol": "code",
  "sin-only": "code",
  "pom-specs-sin-localizadores": "code",
  "pom-clases-de-pagina": "code",
  "fixtures-personalizados": "code",
  "sin-duplicacion": "code",
  "sin-credenciales-en-codigo": "code+workflows+data",
  "ci-dispara-en-pr": "workflows",
  "ci-sin-pull-request-target": "workflows",
  "ci-permisos-minimos": "workflows",
  "ci-artefactos-siempre": "workflows",
  "ci-secretos": "workflows+scripts",
  "ci-humo-tras-despliegue": "workflows+scripts",
  "ci-actionlint": "workflows",
  "ci-rama-protegida": "workflows+scripts",
  "ci-ejecucion-real": "workflows+scripts",
  "docker-imagen-playwright-coincide": "docker",
  "docker-ignore": "docker",
  "compose-seguro": "docker",
};

/** Every rule of STATIC_RULES has an entry: the compiler enforces it. */
export const RULES: Record<StaticRule, RuleFn> = {
  "sin-esperas-fijas": notImplemented,
  "sin-arena-interna": notImplemented,
  "localizadores-por-rol": notImplemented,
  "sin-only": notImplemented,
  "pom-specs-sin-localizadores": (...a) => POM_RULES["pom-specs-sin-localizadores"](...a),
  "pom-clases-de-pagina": (...a) => POM_RULES["pom-clases-de-pagina"](...a),
  "fixtures-personalizados": (...a) => POM_RULES["fixtures-personalizados"](...a),
  "sin-duplicacion": (...a) => POM_RULES["sin-duplicacion"](...a),
  "sin-credenciales-en-codigo": (...a) => POM_RULES["sin-credenciales-en-codigo"](...a),
  "ci-dispara-en-pr": CI_RULES["ci-dispara-en-pr"],
  "ci-sin-pull-request-target": CI_RULES["ci-sin-pull-request-target"],
  "ci-permisos-minimos": CI_RULES["ci-permisos-minimos"],
  "ci-artefactos-siempre": CI_RULES["ci-artefactos-siempre"],
  "ci-secretos": CI_RULES["ci-secretos"],
  "ci-humo-tras-despliegue": CI_RULES["ci-humo-tras-despliegue"],
  "ci-actionlint": CI_RULES["ci-actionlint"],
  "ci-rama-protegida": CI_RULES["ci-rama-protegida"],
  "ci-ejecucion-real": CI_RULES["ci-ejecucion-real"],
  "docker-imagen-playwright-coincide": DOCKER_RULES["docker-imagen-playwright-coincide"],
  "docker-ignore": DOCKER_RULES["docker-ignore"],
  "compose-seguro": DOCKER_RULES["compose-seguro"],
  ...CODE_RULES,
};

const posix = (p: string) => p.split("\\").join("/");

/**
 * Files of the `docker` scope derived from the normalized compose model (M7): the compose file,
 * the Dockerfile and `.dockerignore` of the service's build context, and the root `package.json`.
 * Null when the model is not usable (the regex fallback applies).
 */
export function dockerPaths(facts: RepoFacts, ctx: RuleContext): Set<string> | null {
  const config = facts.composeConfig;
  if (!ctx.compose || !config || !("ok" in config) || !config.ok) return null;
  const services = (config.model as { services?: Record<string, { build?: unknown }> } | null)
    ?.services;
  const build = services?.[ctx.compose.servicio]?.build;
  const rel = (p: string) => (isAbsolute(p) ? posix(relative(facts.root, p)) : posix(normalize(p)));
  const out = new Set<string>([posix(normalize(ctx.compose.archivo)), "package.json"]);
  if (build !== undefined && build !== null) {
    const b = typeof build === "string" ? { context: build } : (build as Record<string, unknown>);
    const context = rel(typeof b.context === "string" ? b.context : ".");
    const dockerfile = typeof b.dockerfile === "string" ? b.dockerfile : "Dockerfile";
    const df = isAbsolute(dockerfile) ? rel(dockerfile) : posix(join(context, dockerfile));
    for (const p of [
      df,
      `${df}.dockerignore`,
      posix(join(context, ".dockerignore")),
      posix(join(context, "package.json")),
    ])
      if (!p.startsWith("..")) out.add(p);
  }
  return out;
}

export function runStaticRule(
  rule: StaticRule,
  facts: RepoFacts,
  ctx: RuleContext,
  rules: Record<StaticRule, RuleFn> = RULES,
): RuleOutcome {
  const fn = rules[rule] as RuleFn | undefined;
  const scope = RULE_SCOPES[rule] as RuleScope | undefined;
  if (!fn || !scope) return { error: `Regla desconocida: ${rule}` };

  const need = RULE_FACTS[rule];
  if (need) {
    const fact = facts[need];
    if (!fact) return { error: `No se obtuvo el dato «${need}»` };
    if ("error" in fact) return { error: fact.error };
    if (need === "composeConfig" && "message" in fact)
      return { pass: false, evidence: `compose inválido: ${fact.message}` };
  }

  const only = scope === "docker" ? dockerPaths(facts, ctx) : null;
  const inScope = (path: string) => (only ? only.has(path) : SCOPES[scope].test(path));
  const unread = facts.omitted.filter(
    (o) => inScope(o.path) || (scope === "code" && ctx.testFiles.includes(o.path)),
  );
  if (unread.length) {
    const shown = unread.slice(0, 3).map((o) => `${o.path} (${OMIT_REASON[o.reason]})`);
    return {
      pass: false,
      evidence: `No se pudo revisar: ${shown.join(", ")}${unread.length > 3 ? ", …" : ""}`,
    };
  }
  return fn(
    facts.files.filter((f) => inScope(f.path)),
    facts,
    ctx,
  );
}
