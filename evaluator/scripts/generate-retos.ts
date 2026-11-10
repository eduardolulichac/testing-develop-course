/**
 * Writes `evaluator/retos/<slug>.json` from `criterio_aprobacion` of every `tipo: reto`
 * exercise in `content/**\/*.ejercicios.yaml`. `--check` fails if a file differs (CI).
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { challengeCriteriaSchema } from "@course/shared";

// `--root <dir>` points the script at another tree with the same layout (used by the tests).
const rootArg = process.argv.indexOf("--root");
const root =
  rootArg >= 0
    ? resolve(process.argv[rootArg + 1] ?? "")
    : resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "evaluator/retos");
const check = process.argv.includes("--check");

function* yamlFiles(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* yamlFiles(p);
    else if (e.name.endsWith(".ejercicios.yaml")) yield p;
  }
}

function* tsFiles(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules") yield* tsFiles(p);
    } else if (e.name.endsWith(".ts")) yield p;
  }
}

/** Template-vs-criteria consistency (design E4_F2 §3.2): returns one message per problem. */
function checkTemplate(slug: string, criteria: ReturnType<typeof challengeCriteriaSchema.parse>) {
  const problems: string[] = [];
  const tpl = join(root, "templates", slug);
  const where = `templates/${slug}`;
  if (!existsSync(tpl)) return [`${where} no existe`];

  const challengeFile = join(tpl, ".course/challenge.json");
  try {
    const c = JSON.parse(readFileSync(challengeFile, "utf8")) as { exercise?: unknown };
    if (c.exercise !== slug)
      problems.push(`${where}/.course/challenge.json: exercise no es "${slug}"`);
  } catch {
    problems.push(`${where}/.course/challenge.json falta o no es JSON válido`);
  }

  const wfFile = join(tpl, ".github/workflows/evaluar.yml");
  if (!existsSync(wfFile)) problems.push(`${where}/.github/workflows/evaluar.yml no existe`);
  else if (
    !new RegExp(`exercise:\\s*["']?${slug}["']?(\\s|$)`, "m").test(readFileSync(wfFile, "utf8"))
  )
    problems.push(`${where}/.github/workflows/evaluar.yml no contiene "exercise: ${slug}"`);

  let tests: string | null = null;
  for (const c of criteria.criterios) {
    if (c.tipo === "reporte_titulos") {
      tests ??= [...tsFiles(join(tpl, "tests"))].map((f) => readFileSync(f, "utf8")).join("\n");
      for (const t of c.titulos)
        if (!tests.includes(t))
          problems.push(`${where}/tests: el título «${t}» del criterio ${c.id} no aparece literal`);
    } else if (c.tipo === "informe") {
      const f = join(tpl, c.archivo);
      if (!existsSync(f) || !statSync(f).isFile())
        problems.push(`${where}/${c.archivo}: falta el esqueleto del criterio ${c.id}`);
    }
  }
  return problems;
}

let bad = 0;
const expected = new Set<string>();
for (const file of yamlFiles(join(root, "content"))) {
  const data = parse(readFileSync(file, "utf8")) as { ejercicios?: Array<Record<string, unknown>> };
  for (const ex of data.ejercicios ?? []) {
    if (ex.tipo !== "reto") continue;
    const slug = String(ex.slug);
    const criteria = challengeCriteriaSchema.parse(ex.criterio_aprobacion);
    const text = JSON.stringify(criteria, null, 2) + "\n";
    const target = join(outDir, `${slug}.json`);
    expected.add(`${slug}.json`);
    if (check) {
      for (const p of checkTemplate(slug, criteria)) {
        console.error(p);
        bad++;
      }
      if (!existsSync(target) || readFileSync(target, "utf8") !== text) {
        console.error(
          `evaluator/retos/${slug}.json no coincide con content/ (ejecuta pnpm --filter @course/evaluator retos:generate)`,
        );
        bad++;
      }
    } else {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(target, text);
      console.log(`escrito ${slug}.json`);
    }
  }
}
if (check && existsSync(outDir)) {
  for (const f of readdirSync(outDir)) {
    if (f.endsWith(".json") && !expected.has(f)) {
      console.error(`evaluator/retos/${f} no tiene reto en content/`);
      bad++;
    }
  }
}
process.exit(bad ? 1 : 0);
