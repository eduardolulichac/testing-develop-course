import { decideFault, type Effect } from "./fault.ts";
import type { Registry } from "./registry.ts";
import type { Defect, DefectRef, Fault, Requirements, Scenario } from "./schema.ts";

export interface ResolvedFault {
  defectId: string;
  fault: Fault;
}

export interface Engine {
  scenarioId: string;
  release: string | null;
  rngSeed: number;
  /** Sync, no I/O. */
  isActive(id: string): boolean;
  /** Scenario/release params override the catalog's. */
  param<T>(id: string, key: string): T | undefined;
  /** Active faults bound to an injection point. */
  faultsAt(point: string): ResolvedFault[];
  /** Combined effect of every fault at `point` for call number `n` (error > timeout > delay). */
  decide(point: string, n: number): Effect;
  /** `environment.clock` when set, otherwise the real time. */
  now(): Date;
  /** Active defects in the "web" layer. */
  uiFlags(): string[];
  /** The selected release's requirements (or the latest earlier one), else the scenario's. */
  requirements(): Requirements | null;
}

export interface EngineOptions {
  scenario: Scenario;
  registry: Registry;
  release?: string;
  rngSeed?: number;
  allowRunnerOnly: boolean;
  /** Test-only: force defects on (true) or off (false). */
  overrides?: Record<string, boolean>;
}

const refId = (ref: DefectRef) => (typeof ref === "string" ? ref : ref.id);
const refParams = (ref: DefectRef) => (typeof ref === "string" ? {} : ref.params);

const SEVERITY: Record<Effect["type"], number> = { none: 0, delay: 1, timeout: 2, error: 3 };

export function createEngine(options: EngineOptions): Engine {
  const { scenario, registry, allowRunnerOnly } = options;

  const releases = scenario.releases;
  const release = options.release ?? scenario.defaultRelease ?? releases[0]?.id ?? null;
  if (release !== null && !releases.some((r) => r.id === release)) {
    throw new Error(`${scenario.id}: el release "${release}" no existe`);
  }
  const rngSeed = options.rngSeed ?? scenario.seed.rngSeed;

  // Cumulative: base defects, then every release up to and including the selected one.
  const active = new Map<string, Record<string, unknown>>();
  const apply = (refs: DefectRef[]) => refs.forEach((r) => active.set(refId(r), refParams(r)));
  apply(scenario.defects);
  const upTo = release === null ? -1 : releases.findIndex((r) => r.id === release);
  for (const r of releases.slice(0, upTo + 1)) {
    apply(r.addDefects);
    r.removeDefects.forEach((id) => active.delete(id));
  }
  for (const [id, on] of Object.entries(options.overrides ?? {})) {
    if (on) active.set(id, active.get(id) ?? {});
    else active.delete(id);
  }

  const defectOf = (id: string): Defect => {
    const d = registry.defects.get(id);
    if (!d) throw new Error(`Defecto desconocido: ${id}`);
    return d;
  };
  for (const id of active.keys()) {
    if (defectOf(id).runnerOnly && !allowRunnerOnly) {
      throw new Error(`${scenario.id}: el defecto ${id} solo puede activarse en la Arena efímera`);
    }
  }

  const faultsAt = (point: string): ResolvedFault[] =>
    [...active.keys()].flatMap((id) => {
      const d = defectOf(id);
      return d.kind === "fault" && d.fault && d.point === point
        ? [{ defectId: id, fault: d.fault }]
        : [];
    });

  const requirements = (): Requirements | null => {
    for (const r of releases.slice(0, upTo + 1).reverse())
      if (r.requirements) return r.requirements;
    return scenario.requirements ?? null;
  };

  return {
    scenarioId: scenario.id,
    release,
    rngSeed,
    isActive: (id) => active.has(id),
    param: <T>(id: string, key: string) =>
      (active.get(id)?.[key] ?? registry.defects.get(id)?.params[key]) as T | undefined,
    faultsAt,
    decide(point, n) {
      let result: Effect = { type: "none" };
      for (const { fault } of faultsAt(point)) {
        const effect = decideFault(fault, rngSeed, point, n);
        const better =
          SEVERITY[effect.type] > SEVERITY[result.type] ||
          (effect.type === "delay" && result.type === "delay" && effect.ms > result.ms);
        if (better) result = effect;
      }
      return result;
    },
    now: () => (scenario.environment.clock ? new Date(scenario.environment.clock) : new Date()),
    uiFlags: () => [...active.keys()].filter((id) => defectOf(id).layer === "web"),
    requirements,
  };
}
