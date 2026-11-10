/**
 * Generates the 43 lesson skeletons in content/fase-N/<code>-<slug>.mdx.
 * Run: pnpm generate:skeletons [--force]
 * Existing files that no longer contain a TODO marker (real content) are never overwritten
 * unless --force is passed.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LESSON_SECTIONS,
  LEVEL_BY_PHASE,
  validateLessonFrontmatter,
  type LessonFrontmatter,
} from "../packages/shared/src/index";
import { CONTENT_VERSION, MODULES } from "./modules";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const force = process.argv.includes("--force");

const q = (s: string) => JSON.stringify(s);
const list = (a: string[]) => `[${a.map(q).join(", ")}]`;

function render(fm: LessonFrontmatter): string {
  const lines = [
    "---",
    `modulo: ${q(fm.modulo)}`,
    `titulo: ${q(fm.titulo)}`,
    `fase: ${fm.fase}`,
    `nivel: ${q(fm.nivel)}`,
    `duracion_min: ${fm.duracion_min}`,
    `prerequisitos: ${list(fm.prerequisitos)}`,
    ...(fm.escenario ? [`escenario: ${q(fm.escenario)}`] : []),
    ...(fm.reto ? [`reto: ${q(fm.reto)}`] : []),
    `version: ${q(fm.version)}`,
    `herramientas: ${list(fm.herramientas)}`,
    "---",
    "",
    ...LESSON_SECTIONS.flatMap((name, i) => [`## ${i + 1}. ${name}`, "", "TODO", ""]),
  ];
  return lines.join("\n");
}

let written = 0;
let skipped = 0;
MODULES.forEach((m, i) => {
  const fase = Number(m.code.split(".")[0]) as keyof typeof LEVEL_BY_PHASE;
  const fm: LessonFrontmatter = {
    modulo: m.code,
    titulo: m.title,
    fase,
    nivel: LEVEL_BY_PHASE[fase],
    duracion_min: m.minutes,
    // Linear order of the roadmap: each module requires the previous one.
    prerequisitos: i === 0 ? [] : [MODULES[i - 1]!.code],
    ...(m.scenario ? { escenario: m.scenario } : {}),
    ...(m.challenge ? { reto: m.challenge } : {}),
    version: CONTENT_VERSION,
    herramientas: m.tools,
  };
  const check = validateLessonFrontmatter(fm);
  if (!check.success) throw new Error(`${m.code}: ${check.errors.join("; ")}`);

  const dir = join(root, "content", `fase-${fase}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${m.code}-${m.slug}.mdx`);
  if (existsSync(file) && !force && !readFileSync(file, "utf8").includes("TODO")) {
    skipped++;
    return;
  }
  writeFileSync(file, render(fm));
  written++;
});
console.log(`Skeletons written: ${written}, skipped (real content): ${skipped}`);
