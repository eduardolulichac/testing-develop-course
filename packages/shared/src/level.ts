import { z } from "zod";
import { COMPETENCIES, type Competency } from "./challenge-result";

// Seniority rules. Design: docs/NIVELES_DISENO.md. The SQL function `recalculate_level` replicates
// this module; `computeLevel` is its test oracle and the source of the texts shown in the UI.

export type Level = 0 | 1 | 2 | 3 | 4;
export type Tramo = 1 | 2 | 3 | 4;

export interface LevelStep {
  nivel: Tramo;
  /** Quality threshold U(L) for the accumulated score of every competency. */
  umbral: number;
  /** Competencies that must have data and reach `umbral`. */
  requeridas: readonly Competency[];
  /** Challenge slugs that must be approved. */
  obligatorios: readonly string[];
}

export interface LevelRules {
  version: number;
  /** `phases.orden` -> tramo. */
  tramoPorFase: Readonly<Record<string, Tramo>>;
  /** Attempt factor: first entry whose `hasta` is >= the attempt; the last one has no `hasta`. */
  factorIntentos: readonly { hasta?: number; factor: number }[];
  /** Weight of the first quiz attempt of each lesson, in `tecnica`. 0 = quizzes do not count. */
  pesoQuiz: number;
  coberturaMinima: number;
  minimoAprobados: number;
  minimoDisponibles: number;
  /** A competency that is not required but has data must reach `umbral - tolerancia`. */
  toleranciaNoRequeridas: number;
  niveles: readonly LevelStep[];
}

export const LEVEL_RULES_V1: LevelRules = {
  version: 1,
  tramoPorFase: { "0": 1, "1": 1, "2": 2, "3": 3, "4": 3, "5": 4 },
  factorIntentos: [{ hasta: 2, factor: 1 }, { hasta: 5, factor: 0.85 }, { factor: 0.7 }],
  pesoQuiz: 0,
  coberturaMinima: 0.8,
  minimoAprobados: 3,
  minimoDisponibles: 2,
  toleranciaNoRequeridas: 10,
  niveles: [
    { nivel: 1, umbral: 55, requeridas: ["tecnica", "analisis"], obligatorios: [] },
    { nivel: 2, umbral: 60, requeridas: ["tecnica", "analisis", "autonomia"], obligatorios: [] },
    {
      nivel: 3,
      umbral: 65,
      requeridas: ["tecnica", "analisis", "autonomia", "criterio_ia"],
      obligatorios: [],
    },
    {
      nivel: 4,
      umbral: 70,
      requeridas: ["tecnica", "analisis", "autonomia", "criterio_ia", "comunicacion"],
      obligatorios: ["reto-5-6-proyecto-final"],
    },
  ],
};

// --- Input ---------------------------------------------------------------------------------

/** A published challenge and, if any, the student's first approved verified submission of it. */
export interface LevelChallenge {
  slug: string;
  titulo: string;
  modulo: string;
  tramo: Tramo;
  /** Position in the course (roadmap order). */
  orden: number;
  /** Sum of the weights of the criteria per competency (current `criterio_aprobacion`). */
  pesos: Partial<Record<Competency, number>>;
  /** Sum of the weights of all the criteria (includes competencies whose weight is 0 only if > 0). */
  pesoTotal: number;
  aprobado: null | {
    intento: number;
    /** `detalle_json.competencias` of that submission (0-100 per competency). */
    competencias: Partial<Record<Competency, number>>;
  };
}

/** Grade of the FIRST attempt of a lesson quiz (H35). */
export interface LevelQuiz {
  tramo: Tramo;
  nota: number;
}

export interface LevelEvidence {
  challenges: readonly LevelChallenge[];
  quizzes: readonly LevelQuiz[];
}

// --- Output --------------------------------------------------------------------------------

export const levelDetailSchema = z.object({
  reglas_version: z.number().int(),
  siguiente: z.number().int().min(1).max(4).nullable(),
  tramos: z.array(
    z.object({
      tramo: z.number().int().min(1).max(4),
      disponibles: z.number().int().min(0),
      aprobados: z.number().int().min(0),
      minimo: z.number().int().min(0),
      cobertura: z.number().min(0).max(1),
    }),
  ),
  competencias: z.array(
    z.discriminatedUnion("estado", [
      z.object({
        competencia: z.enum(COMPETENCIES),
        estado: z.literal("con_datos"),
        puntaje: z.number().min(0),
        evidencia: z.number().int().min(1),
      }),
      z.object({
        competencia: z.enum(COMPETENCIES),
        estado: z.literal("sin_datos"),
        /** Module code of the first challenge that measures it, or null. */
        se_mide_desde: z.string().nullable(),
      }),
    ]),
  ),
  faltan: z.array(
    z.discriminatedUnion("tipo", [
      z.object({
        tipo: z.literal("retos"),
        tramo: z.number().int(),
        faltan: z.number().int().min(1),
        pendientes: z.array(z.object({ slug: z.string(), titulo: z.string(), modulo: z.string() })),
      }),
      z.object({
        tipo: z.literal("calidad"),
        competencia: z.enum(COMPETENCIES),
        actual: z.number().nullable(),
        umbral: z.number(),
      }),
      z.object({ tipo: z.literal("obligatorio"), slug: z.string() }),
      z.object({
        tipo: z.literal("contenido"),
        tramo: z.number().int(),
        motivo: z.literal("pocos_retos_publicados"),
      }),
      z.object({ tipo: z.literal("sin_medir"), competencia: z.enum(COMPETENCIES) }),
    ]),
  ),
});
export type LevelDetail = z.infer<typeof levelDetailSchema>;

export interface CompetencyLevel {
  competencia: Competency;
  puntaje: number;
  evidencia: number;
  /** Highest level reached by this competency alone (never above the provisional level). */
  nivel: Level;
}

export interface LevelResult {
  nivelConfirmado: Level;
  nivelProvisional: Level;
  competencias: CompetencyLevel[];
  detalle: LevelDetail;
}

// --- Computation ---------------------------------------------------------------------------

/** Rounds to 2 decimals like Postgres `round(numeric, 2)` (values are >= 0); the first rounding drops float noise. */
const round2 = (n: number) => Math.round(Math.round(n * 1e6) / 1e4) / 100;

export function attemptFactor(intento: number, rules: LevelRules = LEVEL_RULES_V1): number {
  for (const step of rules.factorIntentos) {
    if (step.hasta === undefined || intento <= step.hasta) return step.factor;
  }
  return rules.factorIntentos[rules.factorIntentos.length - 1]?.factor ?? 1;
}

interface Term {
  tramo: Tramo;
  /** Normalised weight of the term inside its challenge (or `pesoQuiz`). */
  w: number;
  v: number;
}

function termsFor(
  c: Competency,
  evidence: LevelEvidence,
  rules: LevelRules,
): { terms: Term[]; evidencia: Map<Tramo, number> } {
  const terms: Term[] = [];
  const evidencia = new Map<Tramo, number>();
  for (const ch of evidence.challenges) {
    const peso = ch.pesos[c] ?? 0;
    if (!ch.aprobado || peso <= 0 || ch.pesoTotal <= 0) continue;
    const score = ch.aprobado.competencias[c];
    if (score === undefined) continue; // the weight was added after the submission: no data yet
    terms.push({
      tramo: ch.tramo,
      w: peso / ch.pesoTotal,
      v: score * attemptFactor(ch.aprobado.intento, rules),
    });
    evidencia.set(ch.tramo, (evidencia.get(ch.tramo) ?? 0) + 1);
  }
  if (c === "tecnica" && rules.pesoQuiz > 0) {
    for (const q of evidence.quizzes) terms.push({ tramo: q.tramo, w: rules.pesoQuiz, v: q.nota });
  }
  return { terms, evidencia };
}

/**
 * Can this challenge still give data for `c`? It needs weight for `c` and, if it is already
 * approved, a frozen value for `c`: a weight added after the approval can never be earned.
 */
function measures(ch: LevelChallenge, c: Competency): boolean {
  if ((ch.pesos[c] ?? 0) <= 0 || ch.pesoTotal <= 0) return false;
  return !ch.aprobado || ch.aprobado.competencias[c] !== undefined;
}

/** Accumulated quality over the tramos <= L, or null if there is no term. */
function quality(terms: readonly Term[], upTo: number): number | null {
  let num = 0;
  let den = 0;
  for (const t of terms) {
    if (t.tramo > upTo) continue;
    num += t.w * t.v;
    den += t.w;
  }
  return den > 0 ? round2(num / den) : null;
}

function evidenceUpTo(evidencia: Map<Tramo, number>, upTo: number): number {
  let n = 0;
  for (const [tramo, count] of evidencia) if (tramo <= upTo) n += count;
  return n;
}

/**
 * `floor` is the confirmed level the student already has: the confirmed level never drops below it
 * (the SQL caller passes 0 only when the author explicitly allows lowering levels).
 */
export function computeLevel(
  evidence: LevelEvidence,
  rules: LevelRules = LEVEL_RULES_V1,
  floor: Level = 0,
): LevelResult {
  const tramos = [1, 2, 3, 4] as const;
  const stats = new Map<Tramo, { disponibles: number; aprobados: number }>();
  for (const k of tramos) {
    const inTramo = evidence.challenges.filter((ch) => ch.tramo === k);
    stats.set(k, {
      disponibles: inTramo.length,
      aprobados: inTramo.filter((ch) => ch.aprobado).length,
    });
  }

  const perCompetency = new Map(COMPETENCIES.map((c) => [c, termsFor(c, evidence, rules)]));
  const approved = new Set(evidence.challenges.filter((ch) => ch.aprobado).map((ch) => ch.slug));
  const measuredUpTo = (c: Competency, upTo: number) =>
    evidence.challenges.some((ch) => ch.tramo <= upTo && measures(ch, c));

  const coverageOk = (k: Tramo, strict: boolean) => {
    const s = stats.get(k)!;
    if (strict) {
      if (s.disponibles < rules.minimoDisponibles) return false;
      if (s.aprobados < Math.min(rules.minimoAprobados, s.disponibles)) return false;
    } else if (s.disponibles < 1 || s.aprobados < 1) {
      return false;
    }
    return s.aprobados >= rules.coberturaMinima * s.disponibles - 1e-9;
  };

  const meets = (step: LevelStep, strict: boolean) => {
    for (const k of tramos) if (k <= step.nivel && !coverageOk(k, strict)) return false;
    for (const c of COMPETENCIES) {
      const { terms, evidencia } = perCompetency.get(c)!;
      const hasData = evidenceUpTo(evidencia, step.nivel) > 0;
      const q = hasData ? quality(terms, step.nivel) : null;
      if (step.requeridas.includes(c)) {
        if (q === null) {
          if (strict || measuredUpTo(c, step.nivel)) return false;
        } else if (q < step.umbral) {
          return false;
        }
      } else if (q !== null && q < step.umbral - rules.toleranciaNoRequeridas) {
        return false;
      }
    }
    return step.obligatorios.every((slug) => approved.has(slug));
  };

  const highest = (strict: boolean): Level => {
    let best: Level = 0;
    for (const step of rules.niveles) if (meets(step, strict)) best = step.nivel;
    return best;
  };
  const nivelConfirmado = Math.max(highest(true), floor) as Level;
  const nivelProvisional = Math.max(nivelConfirmado, highest(false)) as Level;

  // Per-competency score and level reached.
  const competencias: CompetencyLevel[] = [];
  for (const c of COMPETENCIES) {
    const { terms, evidencia } = perCompetency.get(c)!;
    const total = evidenceUpTo(evidencia, 4);
    if (total === 0) continue;
    let nivel: Level = 0;
    for (const step of rules.niveles) {
      if (step.nivel > nivelProvisional) break;
      const q = evidenceUpTo(evidencia, step.nivel) > 0 ? quality(terms, step.nivel) : null;
      if (q !== null && q >= step.umbral) nivel = step.nivel;
    }
    competencias.push({
      competencia: c,
      puntaje: quality(terms, 4) ?? 0,
      evidencia: total,
      nivel,
    });
  }

  return {
    nivelConfirmado,
    nivelProvisional,
    competencias,
    detalle: buildDetail(evidence, rules, nivelConfirmado, competencias, stats),
  };
}

function buildDetail(
  evidence: LevelEvidence,
  rules: LevelRules,
  confirmado: Level,
  competencias: readonly CompetencyLevel[],
  stats: Map<Tramo, { disponibles: number; aprobados: number }>,
): LevelDetail {
  const siguiente = confirmado >= 4 ? null : ((confirmado + 1) as Tramo);
  const byOrder = [...evidence.challenges].sort((a, b) => a.orden - b.orden);
  const step = siguiente === null ? undefined : rules.niveles.find((n) => n.nivel === siguiente);

  const tramos: LevelDetail["tramos"] = [];
  const faltan: LevelDetail["faltan"] = [];
  if (siguiente !== null && step) {
    for (let k = 1 as Tramo; k <= siguiente; k++) {
      const s = stats.get(k)!;
      const minimo = Math.min(rules.minimoAprobados, s.disponibles);
      tramos.push({
        tramo: k,
        disponibles: s.disponibles,
        aprobados: s.aprobados,
        minimo,
        cobertura: s.disponibles > 0 ? Math.round((s.aprobados / s.disponibles) * 1e4) / 1e4 : 0,
      });
      const needed = Math.max(minimo, Math.ceil(rules.coberturaMinima * s.disponibles - 1e-9));
      const missing = needed - s.aprobados;
      if (missing > 0) {
        faltan.push({
          tipo: "retos",
          tramo: k,
          faltan: missing,
          pendientes: byOrder
            .filter((ch) => ch.tramo === k && !ch.aprobado)
            .map(({ slug, titulo, modulo }) => ({ slug, titulo, modulo })),
        });
      }
    }
    for (const slug of step.obligatorios) {
      if (!evidence.challenges.some((ch) => ch.slug === slug && ch.aprobado)) {
        faltan.push({ tipo: "obligatorio", slug });
      }
    }
    for (const c of COMPETENCIES) {
      const { terms, evidencia } = termsFor(c, evidence, rules);
      const hasData = evidenceUpTo(evidencia, siguiente) > 0;
      const q = hasData ? quality(terms, siguiente) : null;
      const required = step.requeridas.includes(c);
      const umbral = required ? step.umbral : step.umbral - rules.toleranciaNoRequeridas;
      if (q !== null && q < umbral) {
        faltan.push({ tipo: "calidad", competencia: c, actual: q, umbral });
      } else if (q === null && required) {
        const measured = evidence.challenges.some((ch) => ch.tramo <= siguiente && measures(ch, c));
        if (measured) faltan.push({ tipo: "calidad", competencia: c, actual: null, umbral });
        else faltan.push({ tipo: "sin_medir", competencia: c });
      }
    }
    for (let k = 1 as Tramo; k <= siguiente; k++) {
      if (stats.get(k)!.disponibles < rules.minimoDisponibles) {
        faltan.push({ tipo: "contenido", tramo: k, motivo: "pocos_retos_publicados" });
      }
    }
  }

  return {
    reglas_version: rules.version,
    siguiente,
    tramos,
    competencias: COMPETENCIES.map((c) => {
      const found = competencias.find((x) => x.competencia === c);
      if (found) {
        return {
          competencia: c,
          estado: "con_datos" as const,
          puntaje: found.puntaje,
          evidencia: found.evidencia,
        };
      }
      const first = byOrder.find((ch) => measures(ch, c));
      return { competencia: c, estado: "sin_datos" as const, se_mide_desde: first?.modulo ?? null };
    }),
    faltan,
  };
}
