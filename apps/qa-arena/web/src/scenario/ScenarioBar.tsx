import { Link } from "react-router";
import { useScenarioContext } from "./ScenarioProvider";

/** Header controls: scenario and release selectors, environment label and the requirements link. */
export function ScenarioBar() {
  const { state, scenarios, pending, error, activate, confirmPending, dismissPending } =
    useScenarioContext();
  if (!state) return null;
  // Runner Arena (evaluator, template pipelines): nothing may reveal the scenario, the release or
  // the environment. A constant, empty marker tells the evaluator's browser that the state loaded.
  if (state.runnerMode) return <span hidden data-testid="arena-ready" />;
  const releases = state.releases ?? [];
  const env = state.environment ?? { label: "local" };
  const title = (id: string) => scenarios.find((s) => s.id === id)?.title ?? id;
  return (
    <>
      <span hidden data-testid="arena-ready" />
      <div className="scenario-bar" data-testid="scenario-bar">
        {scenarios.length > 0 && (
          <label>
            Escenario{" "}
            <select
              data-testid="scenario-select"
              value={state.scenario}
              onChange={(e) => void activate(e.target.value)}
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {releases.length > 1 && (
          <label>
            Release{" "}
            <select
              data-testid="release-select"
              value={state.release ?? ""}
              onChange={(e) => void activate(state.scenario, e.target.value)}
            >
              {releases.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <span data-testid="env-label" className={`env env-${env.label}`}>
          {env.label}
        </span>
        {env.banner && <span data-testid="env-banner">{env.banner}</span>}
        {state.hasRequirements && (
          <Link to="/requirements" data-testid="nav-requirements">
            Requisitos
          </Link>
        )}
      </div>
      {error && (
        <p role="alert" data-testid="scenario-error">
          {error}
        </p>
      )}
      {pending && (
        <div role="alert" className="scenario-confirm" data-testid="scenario-confirm">
          <p>Esto reinicia tus datos de práctica y carga «{title(pending)}».</p>
          <button data-testid="scenario-confirm-load" onClick={() => void confirmPending()}>
            Cargar escenario
          </button>
          <button data-testid="scenario-confirm-cancel" onClick={dismissPending}>
            Cancelar
          </button>
        </div>
      )}
    </>
  );
}
