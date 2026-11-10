import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router";
import { api, ApiError, tokenStore, type ArenaState, type ScenarioSummary } from "../api";

/**
 * A scenario may replace elements with a deliberately hard version (changing selectors, delayed
 * loading, overlays...). A web-layer defect (`ui.*` flag) is implemented once, in
 * `slotVariants[flag][slot]`, and every scenario that activates the flag reuses it.
 */
export type SlotVariant = (props: { children: ReactNode }) => ReactNode;
export const slotVariants: Record<string, Record<string, SlotVariant>> = {};

// Same shape as the scenario ids in @course/shared.
const SCENARIO_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface ScenarioValue {
  state: ArenaState | null;
  /** True once `/__arena/state` has answered (or failed); until then the scenario is unknown. */
  loaded: boolean;
  scenarios: ScenarioSummary[];
  /** A scenario requested by the URL that would wipe the learner's practice data, awaiting consent. */
  pending: string | null;
  error: string | null;
  activate(id: string, release?: string): Promise<void>;
  confirmPending(): Promise<void>;
  dismissPending(): void;
}

const Ctx = createContext<ScenarioValue | null>(null);

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ArenaState | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Remounting everything below drops stale data (and the auth state) after a reset.
  const [epoch, setEpoch] = useState(0);
  const [params, setParams] = useSearchParams();
  const handled = useRef(false);

  const activate = useCallback(
    async (id: string, release?: string) => {
      setError(null);
      try {
        const before = state?.scenario;
        const next = await api<ArenaState>("PUT", "/__arena/scenario", { id, release });
        setState(next);
        setLoaded(true);
        // A different scenario rebuilt the data, so the old token is gone with it.
        if (before !== next.scenario) tokenStore.set(null);
        setEpoch((e) => e + 1);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "No se pudo cargar el escenario");
      }
    },
    [state?.scenario],
  );

  useEffect(() => {
    api<ArenaState>("GET", "/__arena/state")
      .then(setState)
      .catch(() => setState(null))
      .finally(() => setLoaded(true));
    api<ScenarioSummary[]>("GET", "/__arena/scenarios")
      .then(setScenarios)
      .catch(() => setScenarios([]));
  }, []);

  // `?escenario=<id>` (links from the course): validate, activate, then drop it from the URL.
  useEffect(() => {
    const requested = params.get("escenario");
    if (!state || handled.current || requested === null) return;
    handled.current = true;
    // Runner Arena: the page cannot switch scenarios (the API would refuse it anyway).
    if (state.runnerMode) {
      const rest = new URLSearchParams(params);
      rest.delete("escenario");
      setParams(rest, { replace: true });
      return;
    }
    const rest = new URLSearchParams(params);
    rest.delete("escenario");
    setParams(rest, { replace: true });
    if (!SCENARIO_ID.test(requested) || requested === state.scenario) return;
    // Loading another scenario replaces the practice data; ask first when there is something to lose.
    if (state.scenario !== "baseline") setPending(requested);
    else void activate(requested);
  }, [state, params, setParams, activate]);

  const value: ScenarioValue = {
    state,
    loaded,
    scenarios,
    pending,
    error,
    activate,
    async confirmPending() {
      const id = pending;
      setPending(null);
      if (id) await activate(id);
    },
    dismissPending: () => setPending(null),
  };
  return (
    <Ctx.Provider value={value}>
      <Fragment key={epoch}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export function useScenarioContext(): ScenarioValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("ScenarioProvider missing");
  return v;
}

export function useScenario(): { scenario: string; state: ArenaState | null } {
  const { state } = useScenarioContext();
  return { scenario: state?.scenario ?? "baseline", state };
}

export function ScenarioSlot({ name, children }: { name: string; children: ReactNode }) {
  const { state } = useScenario();
  const Variant = (state?.uiFlags ?? []).map((flag) => slotVariants[flag]?.[name]).find(Boolean);
  return Variant ? <>{Variant({ children })}</> : <>{children}</>;
}
