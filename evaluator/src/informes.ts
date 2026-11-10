import { z } from "zod";
import type { PhaseResult, TestInfo } from "./evaluate.ts";
import { OMIT_REASON, type OmittedFile, type SourceFile } from "./static-rules.ts";
import { MAX_YAML_BYTES, parseYamlSafe } from "./yaml-safe.ts";

/** Formats of the files the student writes (design §3.5 and §3.7). Owned by the evaluator. */
export const MAX_INFORME_BYTES = MAX_YAML_BYTES;

const text = (min: number, max = 500) => z.string().trim().min(min).max(max);

export const defectoSchema = z.strictObject({
  titulo: text(10, 120),
  /** Title or titlePath of a test, exactly as the report shows it. */
  test: text(1, 300),
  pasos: z.array(text(1, 300)).min(2).max(20),
  esperado: text(10),
  obtenido: text(10),
  severidad: z.enum(["baja", "media", "alta", "critica"]),
});
export const defectosV1 = z.strictObject({ defectos: z.array(z.unknown()).max(100) });

export const usoIaSchema = z
  .strictObject({
    archivo: text(1, 200),
    pedido: text(20),
    decision: z.enum(["acepto", "modifico", "rechazo"]),
    motivo: text(0).optional(),
  })
  .refine((u) => u.decision === "acepto" || (u.motivo ?? "").length >= 30, {
    message: "motivo de al menos 30 caracteres si modificas o rechazas",
    path: ["motivo"],
  });
export const registroIaV1 = z.strictObject({ usos: z.array(z.unknown()).max(100) });

export type InformeFormato = "defectos-v1" | "registro-ia-v1";
export interface InformeOutcome {
  pass: boolean;
  evidence: string;
}

const BASELINE = "baseline||";

function parseYamlFile(file: SourceFile | undefined, archivo: string): unknown | InformeOutcome {
  if (!file) return { pass: false, evidence: `No existe ${archivo}` };
  const r = parseYamlSafe(file.content, archivo);
  return r.ok ? r.data : { pass: false, evidence: r.error };
}

const isOutcome = (x: unknown): x is InformeOutcome =>
  typeof x === "object" && x !== null && "pass" in x && "evidence" in x;

const matches = (t: TestInfo, name: string) => t.title === name || t.titlePath === name;

/**
 * Pure check of a student report file against the evaluator's own evidence: a defect counts
 * only if its `test` passes in baseline and fails in some scenario phase AND is a specific
 * detector there (`specificOf`, review C1: a test that fails in every scenario is a fingerprint
 * of the Arena, not evidence of a defect). Without `specificOf` only the baseline condition applies.
 */
export function checkInforme(
  formato: InformeFormato,
  archivo: string,
  min: number,
  files: readonly SourceFile[],
  phases: ReadonlyMap<string, PhaseResult>,
  omitted: readonly OmittedFile[] = [],
  specificOf: (phase: PhaseResult) => readonly TestInfo[] = (p) => p.list,
): InformeOutcome {
  const path = archivo.replace(/^\.\//, "");
  const skipped = omitted.find((o) => o.path === path);
  if (skipped)
    return {
      pass: false,
      evidence: `${archivo} no se pudo revisar (${OMIT_REASON[skipped.reason]})`,
    };
  const file = files.find((f) => f.path === path);
  const data = parseYamlFile(file, archivo);
  if (isOutcome(data)) return data;

  if (formato === "defectos-v1") {
    const root = defectosV1.safeParse(data);
    if (!root.success) return { pass: false, evidence: `${archivo}: falta la lista «defectos»` };
    const baseline = phases.get(BASELINE);
    const scenarioPhases = [...phases.values()].filter((p) => p.scenario !== "baseline");
    const counted = new Set<string>();
    let invalid = 0;
    let unproven = 0;
    for (const raw of root.data.defectos) {
      const d = defectoSchema.safeParse(raw);
      if (!d.success) {
        invalid++;
        continue;
      }
      const passesBaseline = baseline?.list.some(
        (t) => matches(t, d.data.test) && t.status === "passed",
      );
      const failsInScenario = scenarioPhases.some((p) =>
        specificOf(p).some((t) => matches(t, d.data.test) && t.status === "failed"),
      );
      if (passesBaseline && failsInScenario) counted.add(d.data.test);
      else unproven++;
    }
    const base = `${counted.size} defectos documentados y demostrados por un test (se piden ${min})`;
    const extra = [
      invalid ? `${invalid} con formato inválido` : "",
      unproven ? `${unproven} sin un test que pase en baseline y falle solo con ese defecto` : "",
    ].filter(Boolean);
    return {
      pass: counted.size >= min,
      evidence: extra.length ? `${base}; ${extra.join("; ")}` : base,
    };
  }

  const root = registroIaV1.safeParse(data);
  if (!root.success) return { pass: false, evidence: `${archivo}: falta la lista «usos»` };
  // One use per file: repeating the same entry does not add evidence (B5).
  const seen = new Set<string>();
  const valid = root.data.usos.flatMap((u) => {
    const r = usoIaSchema.safeParse(u);
    if (!r.success) return [];
    const key = r.data.archivo.replace(/^\.\//, "");
    if (seen.has(key)) return [];
    seen.add(key);
    return [r.data];
  });
  const exists = (p: string) =>
    files.some((f) => f.path === p) || omitted.some((o) => o.path === p);
  const missing = valid.filter((u) => !exists(u.archivo.replace(/^\.\//, "")));
  const changed = valid.filter((u) => u.decision !== "acepto").length;
  const problems = [
    valid.length < min ? `${valid.length} usos válidos, se piden ${min}` : "",
    changed < 1 ? "ningún uso con decisión «modifico» o «rechazo»" : "",
    missing.length ? `archivos que no existen: ${missing.map((u) => u.archivo).join(", ")}` : "",
  ].filter(Boolean);
  return problems.length
    ? { pass: false, evidence: problems.join("; ").slice(0, 400) }
    : { pass: true, evidence: `${valid.length} usos registrados, ${changed} con cambios` };
}
