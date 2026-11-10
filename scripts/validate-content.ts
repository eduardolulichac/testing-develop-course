/**
 * Validates content/**\/*.mdx. Run: pnpm validate:content
 * Errors fail the run (exit 1); warnings do not.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  exercisesFileSchema,
  findTodoMarkers,
  LESSON_SECTIONS,
  quizSchema,
  TOTAL_MODULES,
  validateLessonFrontmatter,
  type Exercise,
  type LessonFrontmatter,
} from "../packages/shared/src/index";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = join(root, "content");
const scenariosDir = join(root, "apps", "qa-arena", "scenarios");

const errors: string[] = [];
const warnings: string[] = [];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".mdx") ? [join(dir, e.name)] : [],
  );
}

function splitFrontmatter(text: string): { yaml: string; body: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  return m ? { yaml: m[1] ?? "", body: m[2] ?? "" } : null;
}

const lessons = new Map<string, { file: string; fm: LessonFrontmatter }>();
/** Modules whose body has a bare `<Quiz />` (its questions come from `<modulo>.quiz.yaml`). */
const bareQuiz = new Set<string>();
/** `<Ejercicio id="...">` references per module. */
const exerciseRefs = new Map<string, string[]>();

for (const file of walk(contentDir).sort()) {
  const rel = relative(root, file);
  const parts = splitFrontmatter(readFileSync(file, "utf8"));
  if (!parts) {
    errors.push(`${rel}: falta el bloque de frontmatter`);
    continue;
  }
  let raw: unknown;
  try {
    raw = parseYaml(parts.yaml);
  } catch (e) {
    errors.push(`${rel}: YAML inválido (${(e as Error).message})`);
    continue;
  }
  const result = validateLessonFrontmatter(raw);
  if (!result.success) {
    result.errors.forEach((msg) => errors.push(`${rel}: ${msg}`));
    continue;
  }
  const fm = result.data;

  if (lessons.has(fm.modulo)) {
    errors.push(
      `${rel}: módulo ${fm.modulo} duplicado (también en ${lessons.get(fm.modulo)!.file})`,
    );
  } else {
    lessons.set(fm.modulo, { file: rel, fm });
  }

  if (/<Quiz\s*\/>/.test(parts.body)) bareQuiz.add(fm.modulo);
  const refs = [...parts.body.matchAll(/<Ejercicio\b[^>]*?\bid="([^"]+)"/g)].map((m) => m[1] ?? "");
  if (refs.length > 0) exerciseRefs.set(fm.modulo, refs);

  if (!basename(file).startsWith(`${fm.modulo}-`) || !rel.includes(`fase-${fm.fase}/`)) {
    errors.push(
      `${rel}: el archivo debe estar en content/fase-${fm.fase}/ y llamarse "${fm.modulo}-<slug>.mdx"`,
    );
  }

  // A published lesson must not show unfinished sections to students (review H29).
  if (fm.estado === "publicado") {
    const todo = findTodoMarkers(parts.body);
    if (todo.length > 0) {
      errors.push(
        `${rel}: está publicada pero tiene ${todo.length} sección(es) con TODO (líneas ${todo.join(", ")} del cuerpo)`,
      );
    }
  }

  // The 9 sections, present and in order.
  const headings = [...parts.body.matchAll(/^##\s+(\d+)\.\s+(.+?)\s*$/gm)].map((m) => ({
    n: Number(m[1]),
    name: m[2],
  }));
  const expected = LESSON_SECTIONS.map((name, i) => `${i + 1}. ${name}`);
  const actual = headings.map((h) => `${h.n}. ${h.name}`);
  if (actual.join("|") !== expected.join("|")) {
    const missing = expected.filter((s) => !actual.includes(s));
    errors.push(
      missing.length
        ? `${rel}: faltan secciones: ${missing.join("; ")}`
        : `${rel}: las 9 secciones deben estar una vez y en orden`,
    );
  }
}

// 43 unique modules, prerequisites exist.
if (lessons.size !== TOTAL_MODULES) {
  errors.push(`Se esperaban ${TOTAL_MODULES} módulos únicos y hay ${lessons.size}`);
}
for (const { file, fm } of lessons.values()) {
  for (const pre of fm.prerequisitos) {
    if (!lessons.has(pre)) errors.push(`${file}: el prerrequisito ${pre} no existe`);
  }
}

// Prerequisite cycles.
const visiting = new Set<string>();
const done = new Set<string>();
function visit(code: string, path: string[]): void {
  if (done.has(code)) return;
  if (visiting.has(code)) {
    errors.push(`Ciclo de prerrequisitos: ${[...path, code].join(" -> ")}`);
    return;
  }
  visiting.add(code);
  for (const pre of lessons.get(code)?.fm.prerequisitos ?? []) visit(pre, [...path, code]);
  visiting.delete(code);
  done.add(code);
}
[...lessons.keys()].forEach((c) => visit(c, []));

// Sidecar files: `<modulo>.quiz.yaml` and `<modulo>.ejercicios.yaml` (review finding H10).
const quizModules = new Set<string>();
const exerciseSlugs = new Map<string, string>();
const guidedByModule = new Map<string, Set<string>>();
const exerciseScenarios: { file: string; slug: string; escenario: string }[] = [];
function walkYaml(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walkYaml(join(dir, e.name))
      : e.name.endsWith(".yaml")
        ? [join(dir, e.name)]
        : [],
  );
}
for (const file of walkYaml(contentDir).sort()) {
  const rel = relative(root, file);
  const m = /^(\d+\.\d+)\.(quiz|ejercicios)\.yaml$/.exec(basename(file));
  if (!m) {
    errors.push(
      `${rel}: nombre no reconocido; use "<modulo>.quiz.yaml" o "<modulo>.ejercicios.yaml"`,
    );
    continue;
  }
  const [, modulo = "", kind] = m;
  const lesson = lessons.get(modulo);
  if (!lesson) {
    errors.push(`${rel}: el módulo ${modulo} no tiene lección`);
    continue;
  }
  if (dirname(join(root, lesson.file)) !== dirname(file)) {
    errors.push(`${rel}: debe estar en la misma carpeta que ${lesson.file}`);
  }
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`${rel}: YAML inválido (${(e as Error).message})`);
    continue;
  }
  const schema = kind === "quiz" ? quizSchema : exercisesFileSchema;
  const result = schema.safeParse(raw);
  if (!result.success) {
    result.error.issues.forEach((i) =>
      errors.push(`${rel}: ${i.path.join(".") || "(root)"}: ${i.message}`),
    );
    continue;
  }
  if (kind === "quiz") {
    quizModules.add(modulo);
  } else {
    for (const ex of (result.data as { ejercicios: Exercise[] }).ejercicios) {
      const prev = exerciseSlugs.get(ex.slug);
      if (prev) errors.push(`${rel}: ejercicio duplicado "${ex.slug}" (también en ${prev})`);
      exerciseSlugs.set(ex.slug, rel);
      if (ex.tipo === "guiado") {
        guidedByModule.set(modulo, (guidedByModule.get(modulo) ?? new Set()).add(ex.slug));
      }
      if (ex.escenario)
        exerciseScenarios.push({ file: rel, slug: ex.slug, escenario: ex.escenario });
    }
  }
}
for (const [modulo, refs] of exerciseRefs) {
  for (const id of refs) {
    if (!guidedByModule.get(modulo)?.has(id)) {
      errors.push(
        `${lessons.get(modulo)?.file}: <Ejercicio id="${id}"> no existe como ejercicio guiado en ${modulo}.ejercicios.yaml`,
      );
    }
  }
}
for (const [modulo, slugs] of guidedByModule) {
  for (const slug of slugs) {
    if (!exerciseRefs.get(modulo)?.includes(slug)) {
      warnings.push(
        `${lessons.get(modulo)?.file}: el ejercicio guiado ${slug} no aparece en la lección`,
      );
    }
  }
}
for (const modulo of bareQuiz) {
  if (!quizModules.has(modulo)) {
    errors.push(`${lessons.get(modulo)?.file}: usa <Quiz /> pero falta ${modulo}.quiz.yaml`);
  }
}
for (const modulo of quizModules) {
  if (!bareQuiz.has(modulo)) {
    warnings.push(
      `${lessons.get(modulo)?.file}: existe ${modulo}.quiz.yaml pero la lección no usa <Quiz />`,
    );
  }
}

// Scenario ids: each folder of apps/qa-arena/scenarios with a scenario.ts is a scenario.
// Unknown ids are warnings while phases 2 to 5 have no scenarios yet.
if (existsSync(scenariosDir)) {
  const known = new Set(
    readdirSync(scenariosDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(scenariosDir, e.name, "scenario.ts")))
      .map((e) => e.name),
  );
  if (known.size > 0) {
    for (const { file, fm } of lessons.values()) {
      if (fm.escenario && !known.has(fm.escenario)) {
        warnings.push(
          `${file}: el escenario "${fm.escenario}" no existe en apps/qa-arena/scenarios`,
        );
      }
    }
    for (const { file, slug, escenario } of exerciseScenarios) {
      if (!known.has(escenario)) {
        warnings.push(
          `${file}: el ejercicio ${slug} usa el escenario "${escenario}", que no existe`,
        );
      }
    }
  }
}

warnings.forEach((w) => console.warn(`WARN  ${w}`));
if (errors.length > 0) {
  errors.forEach((e) => console.error(`ERROR ${e}`));
  console.error(`\nContenido inválido: ${errors.length} error(es).`);
  process.exit(1);
}
console.log(`Contenido válido: ${lessons.size} lecciones, ${warnings.length} aviso(s).`);
