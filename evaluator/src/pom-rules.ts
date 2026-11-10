/**
 * Static rules for POM/DRY and test data (reto-2-2-pom, reto-2-3-api, reto-2-9). Pure: regex over the
 * student's text, no student code is executed. "Spec" means a file Playwright ran (`ctx.testFiles`),
 * never a name pattern the student can dodge (`*.test.ts`, custom `testMatch`).
 */
import { posix } from "node:path";
import type { StaticRule } from "@course/shared";
import { stripComments, type RuleContext, type RuleFn, type SourceFile } from "./static-rules.ts";

const FALLBACK_SPEC = /\.(spec|test)\.[cm]?[jt]sx?$/;
const norm = (p: string) => posix.normalize(p.replace(/^\.\//, ""));
const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;
const sample = (found: string[]) => found.slice(0, 3).join(", ") + (found.length > 3 ? ", …" : "");

/** Files Playwright ran; fallback to `*.spec|test.*` if the report gave none. */
function specFiles(files: SourceFile[], ctx: RuleContext): SourceFile[] {
  if (ctx.testFiles.length === 0) return files.filter((f) => FALLBACK_SPEC.test(f.path));
  const ran = new Set(ctx.testFiles.map(norm));
  return files.filter((f) => ran.has(norm(f.path)));
}

const LOCATOR_CALL =
  /\bpage\s*\.\s*(getBy[A-Za-z]+|locator|click|dblclick|fill|type|press|check|uncheck|selectOption|hover|waitForSelector|\$\$?)\s*\(/g;

const specsSinLocalizadores: RuleFn = (files, _facts, ctx) => {
  const specs = specFiles(files, ctx);
  if (!specs.length) return { pass: false, evidence: "No se encontró ningún spec que se ejecute" };
  const hits: string[] = [];
  for (const spec of specs) {
    const code = stripComments(spec.content);
    for (const m of code.matchAll(LOCATOR_CALL)) hits.push(`${spec.path}:${lineOf(code, m.index)}`);
  }
  return hits.length
    ? { pass: false, evidence: `Los specs usan la página directamente en ${sample(hits)}` }
    : { pass: true, evidence: `${specs.length} specs sin localizadores ni acciones directas` };
};

const CLASS_DECL = /\bexport\s+(?:default\s+)?(?:abstract\s+)?class\s+\w+/;
const PAGE_CTOR = /constructor\s*\([^)]*:\s*Page\b/;
const LOCATES = /\.\s*(getBy[A-Za-z]+|locator)\s*\(/;

const clasesDePagina: RuleFn = (files, _facts, ctx) => {
  const specs = new Set(specFiles(files, ctx).map((f) => norm(f.path)));
  const good: string[] = [];
  for (const f of files) {
    const path = norm(f.path);
    if (!/^pages\/.+\.[cm]?ts$/.test(path) || specs.has(path)) continue;
    const code = stripComments(f.content);
    if (CLASS_DECL.test(code) && PAGE_CTOR.test(code) && LOCATES.test(code)) good.push(path);
  }
  return good.length >= 3
    ? { pass: true, evidence: `${good.length} Page Objects: ${sample(good)}` }
    : {
        pass: false,
        evidence: `Hay ${good.length} Page Objects válidos en pages/ (mínimo 3): una clase exportada, constructor con «page: Page» y un getBy/locator`,
      };
};

const EXTEND = /\.\s*extend\s*(?:<|\(\s*\{)/;
const IMPORT_TEST = /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*["']([^"']+)["']/g;
const REEXPORT = /export\s+(?:\*|\{[^}]*\})\s*from\s*["'](\.{1,2}\/[^"']*)["']/g;
const EXTS = [".ts", ".mts", ".cts", ".tsx", ".js", ".mjs", ".cjs"];

/** Resolves a relative import to a file of the repo (`./x.js` maps to `x.ts`, directories to index). */
function resolveImport(from: string, spec: string, byPath: Map<string, SourceFile>) {
  const base = posix.normalize(posix.join(posix.dirname(from), spec));
  const stem = base.replace(/\.[cm]?js$/, "");
  const candidates = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => stem + e)];
  candidates.push(...EXTS.map((e) => posix.join(base, `index${e}`)));
  return candidates.find((c) => byPath.has(c)) ?? null;
}

const fixturesPersonalizados: RuleFn = (files, _facts, ctx) => {
  const specs = specFiles(files, ctx);
  if (!specs.length) return { pass: false, evidence: "No se encontró ningún spec que se ejecute" };
  const specPaths = new Set(specs.map((s) => norm(s.path)));
  const byPath = new Map(
    files.map((f) => [norm(f.path), { ...f, content: stripComments(f.content) }]),
  );

  // Files that define a fixture (`test.extend`) plus files that only re-export them.
  const providers = new Set<string>();
  for (const [path, f] of byPath)
    if (!specPaths.has(path) && EXTEND.test(f.content)) providers.add(path);
  if (!providers.size) {
    return { pass: false, evidence: "No hay ningún archivo con test.extend fuera de los specs" };
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const [path, f] of byPath) {
      if (providers.has(path) || specPaths.has(path)) continue;
      for (const m of f.content.matchAll(REEXPORT)) {
        const target = resolveImport(path, m[1]!, byPath);
        if (target && providers.has(target)) {
          providers.add(path);
          grew = true;
          break;
        }
      }
    }
  }

  const bad: string[] = [];
  for (const spec of specs) {
    const code = byPath.get(norm(spec.path))!.content;
    const sources = [...code.matchAll(IMPORT_TEST)].map((m) => m[1]!);
    const fromPlaywright = sources.some((s) => s === "@playwright/test");
    const fromFixture = sources.some((s) => {
      if (!/^\.{1,2}\//.test(s)) return false;
      const target = resolveImport(norm(spec.path), s, byPath);
      return target !== null && providers.has(target);
    });
    if (fromPlaywright || !fromFixture) bad.push(spec.path);
  }
  return bad.length
    ? {
        pass: false,
        evidence: `Estos specs no importan «test» de tu fixture (o lo toman de @playwright/test): ${sample(bad)}`,
      }
    : {
        pass: true,
        evidence: `${specs.length} specs usan el fixture de ${sample([...providers])}`,
      };
};

const WINDOW = 8;
const MIN_LINE = 15;
const DUP_PATH = /^(tests|pages|fixtures)\/.+\.[cm]?[jt]sx?$/;

interface Line {
  text: string;
  no: number;
}

/** Significant lines of a file: comment-free, trimmed, collapsed, no imports, no short lines. */
function significantLines(content: string): Line[] {
  const out: Line[] = [];
  stripComments(content)
    .split("\n")
    .forEach((raw, i) => {
      const text = raw.trim().replace(/\s+/g, " ");
      if (text.length < MIN_LINE || /^(import\b|\} from\b)/.test(text)) return;
      out.push({ text, no: i + 1 });
    });
  return out;
}

const sinDuplicacion: RuleFn = (files, _facts, ctx) => {
  const scope = new Set(ctx.testFiles.map(norm));
  const seen = new Map<string, { path: string; at: number; no: number }>();
  const dups: string[] = [];
  for (const f of files) {
    const path = norm(f.path);
    if (!DUP_PATH.test(path) && !scope.has(path)) continue;
    const lines = significantLines(f.content);
    for (let i = 0; i + WINDOW <= lines.length; i++) {
      const key = lines
        .slice(i, i + WINDOW)
        .map((l) => l.text)
        .join("\n");
      const first = seen.get(key);
      if (!first) {
        seen.set(key, { path, at: i, no: lines[i]!.no });
      } else if (first.path !== path || i - first.at >= WINDOW) {
        dups.push(`${first.path}:${first.no} y ${path}:${lines[i]!.no}`);
        // one report per repeated block is enough; skip the windows it overlaps
        i += WINDOW - 1;
      }
    }
  }
  return dups.length
    ? {
        pass: false,
        evidence: `Hay bloques de ${WINDOW} líneas repetidos: ${sample(dups)}`,
      }
    : { pass: true, evidence: `Sin bloques de ${WINDOW} líneas repetidos` };
};

const PASSWORDS = ["Cliente123!", "Admin123!"];
const hex = (s: string, radix = 16) => String.fromCodePoint(parseInt(s, radix));

/** Undoes simple obfuscation: `!`, `\x21`, `\!`, `%21`, and `"Cli" + "ente"` joins. */
function deobfuscate(line: string): string {
  return line
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h: string) => hex(h))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => hex(h))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h: string) => hex(h))
    .replace(/\\([\s\S])/g, "$1")
    .replace(/%21/g, "!")
    .replace(/["'`]\s*\+\s*["'`]/g, "");
}

const sinCredenciales: RuleFn = (files) => {
  const hits: string[] = [];
  for (const f of files) {
    // Comments are NOT stripped: a password in a comment is still published in the repo.
    f.content.split("\n").forEach((line, i) => {
      const flat = deobfuscate(line);
      if (PASSWORDS.some((p) => line.includes(p) || flat.includes(p)))
        hits.push(`${f.path}:${i + 1}`);
    });
  }
  return hits.length
    ? { pass: false, evidence: `Contraseña de práctica escrita en ${sample(hits)}` }
    : { pass: true, evidence: "Sin contraseñas de práctica en el código" };
};

export const POM_RULES = {
  "pom-specs-sin-localizadores": specsSinLocalizadores,
  "pom-clases-de-pagina": clasesDePagina,
  "fixtures-personalizados": fixturesPersonalizados,
  "sin-duplicacion": sinDuplicacion,
  "sin-credenciales-en-codigo": sinCredenciales,
} satisfies Partial<Record<StaticRule, RuleFn>>;
