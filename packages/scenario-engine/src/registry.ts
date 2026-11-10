import {
  defectSchema,
  scenarioSchema,
  type Defect,
  type DefectInput,
  type DefectRef,
  type Scenario,
} from "./schema.ts";

type ScenarioInput = import("zod").input<typeof scenarioSchema>;

/** Scenario input whose defect references are limited to the ids `Id` (typo-safe). */
export type TypedScenarioInput<Id extends string> = Omit<ScenarioInput, "defects" | "releases"> & {
  defects?: (Id | { id: Id; params: Record<string, unknown> })[];
  releases?: (Omit<
    NonNullable<ScenarioInput["releases"]>[number],
    "addDefects" | "removeDefects"
  > & {
    addDefects?: (Id | { id: Id; params: Record<string, unknown> })[];
    removeDefects?: Id[];
  })[];
};

/** Validates a defect catalog; the literal ids flow into the result type (`as const` input). */
export function defineDefects<const T extends readonly DefectInput[]>(
  defects: T,
): readonly (Defect & { id: T[number]["id"] })[] {
  return defects.map((d) => defectSchema.parse(d)) as never;
}

/** Validates one scenario. Bind `Id` to your catalog's ids to catch typos at typecheck. */
export function defineScenario<Id extends string = string>(
  input: TypedScenarioInput<Id>,
): Scenario {
  return scenarioSchema.parse(input);
}

export interface Registry {
  defects: ReadonlyMap<string, Defect>;
  scenarios: ReadonlyMap<string, Scenario>;
}

const refId = (ref: DefectRef) => (typeof ref === "string" ? ref : ref.id);

export interface RegistryOptions {
  /**
   * Injection points backed by an HTTP route (the only ones where `ctx.tick` applies latency
   * or errors). When given, a fault defect on any other point may only be a `timeout`.
   */
  routePoints?: readonly string[];
}

/**
 * Cross-validates the catalog and the scenarios and returns them indexed. Throws one Error
 * listing every problem. A scenario is hosted only if it declares `hosted !== false` and has
 * no runnerOnly defect.
 */
export function createRegistry(
  defects: readonly Defect[],
  scenarios: readonly Scenario[],
  options: RegistryOptions = {},
): Registry {
  const problems: string[] = [];
  const routePoints = options.routePoints ? new Set(options.routePoints) : undefined;
  const defectMap = new Map<string, Defect>();
  for (const d of defects) {
    if (defectMap.has(d.id)) problems.push(`Defecto duplicado: ${d.id}`);
    defectMap.set(d.id, d);
    if (
      routePoints &&
      d.kind === "fault" &&
      !routePoints.has(d.point) &&
      d.fault?.type !== "timeout"
    ) {
      problems.push(
        `${d.id}: el punto "${d.point}" no es de ruta; un fallo "${d.fault?.type}" ahí se ignoraría (solo "timeout")`,
      );
    }
  }

  const scenarioMap = new Map<string, Scenario>();
  for (const s of scenarios) {
    if (scenarioMap.has(s.id)) problems.push(`Escenario duplicado: ${s.id}`);

    const refs = [
      ...s.defects.map(refId),
      ...s.releases.flatMap((r) => [...r.addDefects.map(refId), ...r.removeDefects]),
    ];
    for (const id of refs) {
      if (!defectMap.has(id)) problems.push(`${s.id}: el defecto "${id}" no existe en el catálogo`);
    }

    const releaseIds = s.releases.map((r) => r.id);
    if (new Set(releaseIds).size !== releaseIds.length) {
      problems.push(`${s.id}: ids de release duplicados`);
    }
    if (s.defaultRelease && !releaseIds.includes(s.defaultRelease)) {
      problems.push(`${s.id}: defaultRelease "${s.defaultRelease}" no existe`);
    }

    const runnerOnly = [
      ...s.defects.map(refId),
      ...s.releases.flatMap((r) => r.addDefects.map(refId)),
    ].some((id) => defectMap.get(id)?.runnerOnly);
    scenarioMap.set(s.id, { ...s, hosted: s.hosted && !runnerOnly });
  }

  if (problems.length > 0)
    throw new Error(`Registro de escenarios inválido:\n- ${problems.join("\n- ")}`);
  return { defects: defectMap, scenarios: scenarioMap };
}
