import {
  COMPETENCIES,
  attemptFactor,
  levelDetailSchema,
  type Competency,
  type LevelDetail,
} from "@course/shared";
import { levelLabel } from "./schema";

// Texts and view models of the level section of /perfil (docs/NIVELES_DISENO.md section 7).
// Pure: the page reads the rows and this module decides what is shown.

export const COMPETENCY_LABELS: Record<Competency, string> = {
  tecnica: "Técnica",
  analisis: "Análisis",
  criterio_ia: "Criterio con IA",
  comunicacion: "Comunicación",
  autonomia: "Autonomía",
};

const TRAMO_LABELS: Record<number, string> = {
  1: "Fundamentos y Automatización UI (fases 0 y 1)",
  2: "Framework, API y CI/CD (fase 2)",
  3: "Calidad avanzada e IA aplicada (fases 3 y 4)",
  4: "Estrategia y liderazgo (fase 5)",
};

export type LevelStateRow = {
  nivel_confirmado: number;
  nivel_provisional: number;
  detalle: unknown;
};

export type CompetencyScoreRow = {
  competencia: string;
  puntaje: number | string;
  nivel: number;
  evidencia: number;
};

/** `detalle` is validated on read: a malformed one is dropped instead of breaking the page. */
export function parseDetail(raw: unknown): LevelDetail | null {
  const parsed = levelDetailSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Why the provisional level is above the confirmed one. */
export function provisionalReason(detail: LevelDetail | null): string {
  const lacksContent = detail?.faltan.some((f) => f.tipo === "contenido");
  return lacksContent
    ? "aún hay pocos retos publicados"
    : "falta completar más retos para confirmarlo";
}

export function levelHeadline(
  state: LevelStateRow | null,
  detail: LevelDetail | null,
): { confirmed: string; provisional: string | null } {
  const confirmado = state?.nivel_confirmado ?? 0;
  const provisional = state?.nivel_provisional ?? 0;
  return {
    confirmed: levelLabel(confirmado),
    provisional:
      provisional > confirmado
        ? `${levelLabel(provisional)} (provisional: ${provisionalReason(detail)})`
        : null,
  };
}

export type CompetencyCard = {
  competencia: Competency;
  label: string;
  /** null = "Sin evidencia todavía". */
  data: { puntaje: number; nivel: string; evidencia: number } | null;
  note: string | null;
};

export function buildCompetencyCards(
  scores: readonly CompetencyScoreRow[],
  detail: LevelDetail | null,
): CompetencyCard[] {
  return COMPETENCIES.map((competencia) => {
    const row = scores.find((s) => s.competencia === competencia);
    if (row) {
      return {
        competencia,
        label: COMPETENCY_LABELS[competencia],
        data: {
          puntaje: Number(row.puntaje),
          nivel: row.nivel === 0 ? "Aún sin nivel" : levelLabel(row.nivel),
          evidencia: row.evidencia,
        },
        note: null,
      };
    }
    const entry = detail?.competencias.find((c) => c.competencia === competencia);
    const since = entry?.estado === "sin_datos" ? entry.se_mide_desde : null;
    return {
      competencia,
      label: COMPETENCY_LABELS[competencia],
      data: null,
      note: since ? `Se mide desde el módulo ${since}.` : "Se medirá en retos futuros.",
    };
  });
}

export type Requirement = {
  key: string;
  text: string;
  /** Pending challenges (already public in the roadmap): title and module only. */
  items: { slug: string; label: string }[];
};

type Falta = LevelDetail["faltan"][number];

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

export function describeRequirement(f: Falta): Requirement {
  switch (f.tipo) {
    case "retos":
      return {
        key: `retos-${f.tramo}`,
        text: `Aprueba ${f.faltan} ${plural(f.faltan, "reto más", "retos más")} de ${TRAMO_LABELS[f.tramo] ?? `el tramo ${f.tramo}`}.`,
        items: f.pendientes.map((p) => ({ slug: p.slug, label: `${p.modulo} · ${p.titulo}` })),
      };
    case "calidad": {
      const name = COMPETENCY_LABELS[f.competencia];
      const text =
        f.actual === null
          ? `Tu puntaje de ${name} aún no tiene datos: se calcula al aprobar un reto que la mida.`
          : `Tu puntaje de ${name} es ${f.actual} y necesitas ${f.umbral}. Tus retos ya aprobados quedan fijos; sube aprobando los pendientes en pocos intentos.`;
      return { key: `calidad-${f.competencia}`, text, items: [] };
    }
    case "obligatorio":
      return {
        key: `obligatorio-${f.slug}`,
        text: `Aprueba el reto obligatorio «${f.slug}».`,
        items: [],
      };
    case "contenido":
      return {
        key: `contenido-${f.tramo}`,
        text: `${TRAMO_LABELS[f.tramo] ?? `El tramo ${f.tramo}`} todavía tiene pocos retos publicados. Esto no depende de ti.`,
        items: [],
      };
    case "sin_medir":
      return {
        key: `sin-medir-${f.competencia}`,
        text: `Aún no hay un reto publicado que mida ${COMPETENCY_LABELS[f.competencia]}. Esto no depende de ti.`,
        items: [],
      };
  }
}

export type ApprovedChallenge = {
  slug: string;
  titulo: string;
  intento: number;
  factor: number;
  puntaje: number;
  /** Frozen value: score of the first approved attempt times the attempt factor. */
  valor: number;
};

export type ApprovedSubmissionRow = {
  exercise_id: string;
  intento: number | null;
  puntaje: number | string | null;
};

/** First approved attempt per challenge (lowest `intento`) with its frozen value. */
export function buildApprovedChallenges(
  rows: readonly ApprovedSubmissionRow[],
  exercises: ReadonlyMap<string, { slug: string; titulo: string | null }>,
): ApprovedChallenge[] {
  const first = new Map<string, ApprovedSubmissionRow>();
  for (const r of rows) {
    if (r.intento === null || r.puntaje === null) continue;
    const prev = first.get(r.exercise_id);
    if (!prev || (prev.intento ?? Infinity) > r.intento) first.set(r.exercise_id, r);
  }
  const out: ApprovedChallenge[] = [];
  for (const [id, r] of first) {
    const ex = exercises.get(id);
    if (!ex) continue;
    const factor = attemptFactor(r.intento!);
    const puntaje = Number(r.puntaje);
    out.push({
      slug: ex.slug,
      titulo: ex.titulo ?? ex.slug,
      intento: r.intento!,
      factor,
      puntaje,
      valor: Math.round(puntaje * factor * 100) / 100,
    });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}
