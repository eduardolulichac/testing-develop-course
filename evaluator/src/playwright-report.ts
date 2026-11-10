import { isAbsolute, relative, resolve } from "node:path";
import type { TestCounts, TestInfo } from "./evaluate.ts";

interface PwAnnotation {
  type?: string;
  description?: string;
}
interface PwSpec {
  title?: string;
  file?: string;
  tags?: string[];
  tests?: Array<{ status?: string; annotations?: PwAnnotation[] }>;
}
interface PwSuite {
  title?: string;
  file?: string;
  specs?: PwSpec[];
  suites?: PwSuite[];
}

const unique = (xs: string[]) => [...new Set(xs)];

const STATUS: Record<string, TestInfo["status"]> = {
  expected: "passed",
  unexpected: "failed",
  flaky: "failed",
  skipped: "skipped",
};

/**
 * Flattens `suites[].specs[].tests[]`. The top-level suite is the file (not part of `titlePath`);
 * nested suites are `describe` blocks. Playwright stores tags WITHOUT the `@`.
 */
export function listTests(
  suites: PwSuite[],
  place: (file: string) => string = (f) => f,
): TestInfo[] {
  const out: TestInfo[] = [];
  const walk = (suite: PwSuite, path: string[], file: string) => {
    for (const spec of suite.specs ?? []) {
      const title = spec.title ?? "";
      for (const t of spec.tests ?? []) {
        const tags = unique((spec.tags ?? []).map((x) => x.replace(/^@/, "")));
        const fromNotes = (t.annotations ?? [])
          .filter((a) => a.type === "requisito" && a.description)
          .flatMap((a) => {
            const found = a.description!.match(/REQ-\d+/g);
            return found ?? [a.description!.trim()];
          });
        out.push({
          title,
          file: place(spec.file ?? suite.file ?? file),
          titlePath: [...path, title].join(" › "),
          tags,
          requisitos: unique([...fromNotes, ...tags.filter((x) => /^REQ-\d+$/.test(x))]),
          status: STATUS[t.status ?? ""] ?? "failed",
        });
      }
    }
    for (const child of suite.suites ?? [])
      walk(child, [...path, child.title ?? ""], suite.file ?? file);
  };
  for (const top of suites) walk(top, [], top.file ?? top.title ?? "");
  return out;
}

/** Reads the counts and the test list from Playwright's JSON reporter (`stats` is authoritative). */
export function parsePlaywrightReport(
  json: string,
  opts: { repoRoot?: string; grep?: string | null } = {},
): {
  counts: TestCounts;
  list: TestInfo[];
  crash?: string;
} {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return {
      counts: { total: 0, passed: 0, failed: 0 },
      list: [],
      crash: "La suite no produjo un informe",
    };
  }
  const report = data as {
    stats?: { expected?: number; unexpected?: number; flaky?: number };
    errors?: Array<{ message?: string }>;
    suites?: PwSuite[];
    config?: { rootDir?: string };
  };
  // `spec.file` is relative to Playwright's rootDir (testDir): make it relative to the repo so
  // rules can compare it with repo paths. Outside the repo (Docker) it stays as reported.
  const { repoRoot } = opts;
  const rootDir = report.config?.rootDir;
  const place = (file: string): string => {
    if (!repoRoot) return file;
    const abs = resolve(
      rootDir && isAbsolute(rootDir) ? rootDir : resolve(repoRoot, rootDir ?? ""),
      file,
    );
    const rel = relative(repoRoot, abs).split("\\").join("/");
    return rel.startsWith("..") ? file : rel;
  };
  const expected = report.stats?.expected ?? 0;
  const failed = (report.stats?.unexpected ?? 0) + (report.stats?.flaky ?? 0);
  const counts = { total: expected + failed, passed: expected, failed };
  const list = listTests(report.suites ?? [], place);
  const first = report.errors?.[0]?.message;
  if (counts.total === 0 && first) {
    // Strip ANSI colour codes so the evidence stays readable in the platform.
    // eslint-disable-next-line no-control-regex
    const clean = first.replace(/\u001b\[[0-9;]*m/g, "").split("\n")[0] ?? "";
    if (opts.grep && /No tests found/i.test(clean))
      return { counts, list, crash: `Ningún test lleva la etiqueta ${opts.grep}` };
    return { counts, list, crash: `La suite no pudo ejecutarse: ${clean}`.slice(0, 300) };
  }
  return { counts, list };
}
