/**
 * Prepares the contents of the two PUBLIC repos in a local folder (it never pushes: creating
 * repos and tags is a manual, reviewed step).
 *
 *   tsx scripts/publish.ts evaluator --out <dir> --platform-url <host> --api-digest sha256:… --web-digest sha256:…
 *   (add --dry-run to skip build and retos:generate: only fills the markers)
 *   tsx scripts/publish.ts template  --out <dir> --evaluator-sha <40 hex> [--slug <reto>] [--api-digest … --web-digest …]
 *
 * `evaluator` -> eduardolulichac/qa-course-evaluator (workflow, compose, retos, bundled CLI).
 * `template`  -> eduardolulichac/<slug> (default reto-1-1-login; marked as template; pins the evaluator by SHA
 *                and, if it has `arena/compose.yml`, the Arena image digests).
 * Fixtures with reference solutions stay in the private monorepo (design P6).
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ev = join(root, "evaluator");
const { version } = JSON.parse(readFileSync(join(ev, "package.json"), "utf8")) as {
  version: string;
};

// Verified against the GitHub releases API on 2026-11-06 (tag -> commit).
const ACTIONS = {
  CHECKOUT: "3d3c42e5aac5ba805825da76410c181273ba90b1",
  SETUP_NODE: "949feb2413d6458794dcd2491c4babbbce0c15c1",
  UPLOAD: "cf430e030ddbb5b0abf93d22962f4752f3646cd9",
  DOWNLOAD: "9000827ccba6bdab643e8b6fd33ac0654aef8333",
};
const ACTION_VERSIONS = {
  SETUP_NODE_VERSION: "v7.1.0",
  UPLOAD_VERSION: "v7.0.2",
  DOWNLOAD_VERSION: "v8.0.2",
};

// SHA-256 of actionlint_1.7.12_linux_amd64.tar.gz, copied from the official
// actionlint_1.7.12_checksums.txt (rhysd/actionlint release v1.7.12) and re-checked on download.
const ACTIONLINT_SHA256 = "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8";

const args = process.argv.slice(2);
const mode = args[0];
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const need = (name: string): string => {
  const v = opt(name);
  if (!v) throw new Error(`Falta --${name}`);
  return v;
};

function fill(text: string, values: Record<string, string>): string {
  let out = text;
  for (const [k, v] of Object.entries(values)) out = out.replaceAll(`__${k}__`, v);
  const left = out.match(/__[A-Z_]+__/g);
  if (left) throw new Error(`Marcadores sin rellenar: ${[...new Set(left)].join(", ")}`);
  return out;
}

function emptyDir(dir: string) {
  if (existsSync(dir) && readdirSync(dir).some((f) => f !== ".git")) {
    for (const f of readdirSync(dir))
      if (f !== ".git") rmSync(join(dir, f), { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
}

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

if (mode === undefined || mode === "--help" || mode === "-h") {
  console.log(
    "Uso: publish.ts evaluator --out <dir> --platform-url <host> --api-digest sha256:… --web-digest sha256:… [--dry-run]\n" +
      "     publish.ts template  --out <dir> --evaluator-sha <40 hex> [--slug <reto>] [--api-digest sha256:… --web-digest sha256:…]\n" +
      "       (--slug por defecto reto-1-1-login; los digests son obligatorios si la plantilla lleva arena/compose.yml)",
  );
  process.exit(mode === undefined ? 2 : 0);
}

if (mode === "evaluator") {
  const out = resolve(need("out"));
  const dry = args.includes("--dry-run");
  const digest = /^sha256:[0-9a-f]{64}$/;
  const api = need("api-digest");
  const web = need("web-digest");
  if (!digest.test(api) || !digest.test(web))
    throw new Error("Los digests deben ser sha256:<64 hex>");

  if (!dry) {
    execFileSync("pnpm", ["--filter", "@course/evaluator", "build"], {
      cwd: root,
      stdio: "inherit",
    });
    execFileSync("pnpm", ["--filter", "@course/evaluator", "retos:generate"], {
      cwd: root,
      stdio: "inherit",
    });
  }
  emptyDir(out);

  write(
    join(out, ".github/workflows/evaluate.yml"),
    fill(readFileSync(join(ev, ".github/workflows/evaluate.yml"), "utf8"), {
      ...Object.fromEntries(Object.entries(ACTIONS).map(([k, v]) => [`${k}_SHA`, v])),
      ...ACTION_VERSIONS,
      PLATFORM_URL: need("platform-url"),
      ACTIONLINT_SHA256,
    }),
  );
  write(
    join(out, "compose/arena.yml"),
    fill(readFileSync(join(ev, "compose/arena.yml"), "utf8"), {
      API_DIGEST: api.slice(7),
      WEB_DIGEST: web.slice(7),
    }),
  );
  // `templates/*/arena/compose.yml` (2.6 and 2.8) are NOT written here: they belong to each student's
  // template repo, so `publish.ts template` fills their digests (design E4_F2 §3.2).
  cpSync(join(ev, "compose/init"), join(out, "compose/init"), { recursive: true });
  cpSync(join(ev, "retos"), join(out, "retos"), { recursive: true });
  if (!dry) cpSync(join(ev, "dist/cli.mjs"), join(out, "dist/cli.mjs"));
  write(
    join(out, "README.md"),
    `# qa-course-evaluator ${version}\n\nWorkflow reutilizable que evalúa los retos del curso de QA Automation.\nNo se usa directamente: lo llama \`.github/workflows/evaluar.yml\` de cada plantilla de reto.\nEl código fuente vive en el repositorio privado del curso.\n`,
  );
  console.log(`Evaluador v${version} preparado en ${out}`);
  console.log(
    `Siguiente: revisar, commit, tag v${version} y push; anotar el SHA para la plantilla.`,
  );
} else if (mode === "template") {
  const out = resolve(need("out"));
  const sha = need("evaluator-sha");
  if (!/^[0-9a-f]{40}$/.test(sha))
    throw new Error("--evaluator-sha debe ser un SHA de 40 caracteres");
  // Backwards compatible: without --slug it publishes reto-1-1-login, as before.
  const slug = opt("slug") ?? "reto-1-1-login";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error("--slug inválido");
  const src = join(root, "templates", slug);
  if (!existsSync(src)) throw new Error(`No existe templates/${slug}`);
  const compose = join(src, "arena/compose.yml");
  const values: Record<string, string> = {
    EVALUATOR_SHA: sha,
    EVALUATOR_VERSION: `v${version}`,
  };
  if (existsSync(compose)) {
    const digest = /^sha256:[0-9a-f]{64}$/;
    const api = need("api-digest");
    const web = need("web-digest");
    if (!digest.test(api) || !digest.test(web))
      throw new Error("Los digests deben ser sha256:<64 hex>");
    values.API_DIGEST = api.slice(7);
    values.WEB_DIGEST = web.slice(7);
  }
  emptyDir(out);
  cpSync(src, out, { recursive: true, filter: (p) => !p.includes("node_modules") });
  for (const rel of [".github/workflows/evaluar.yml", "arena/compose.yml"]) {
    const f = join(out, rel);
    if (existsSync(f)) writeFileSync(f, fill(readFileSync(f, "utf8"), values));
  }
  console.log(
    `Plantilla ${slug} preparada en ${out}. Marcarla como plantilla en GitHub (Settings > Template repository).`,
  );
} else {
  console.error("Uso: publish.ts <evaluator|template> --out <dir> …");
  process.exit(2);
}
