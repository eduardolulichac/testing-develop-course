import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore, type ArenaState } from "../api";
import { Requirements } from "../pages/Requirements";
import { ScenarioBar } from "./ScenarioBar";
import { ScenarioProvider, ScenarioSlot, slotVariants } from "./ScenarioProvider";

const baseState: ArenaState = {
  session: "s",
  scenario: "baseline",
  release: null,
  releases: [],
  seedVersion: "arena-seed-2+clean+835",
  environment: { label: "local" },
  uiFlags: [],
  hasRequirements: false,
  assistant: { mode: "normal", faults: [] },
};
const releases = [
  { id: "v1.0.0", label: "Jueves" },
  { id: "v1.1.0", label: "Viernes" },
];
const summaries = [
  { id: "baseline", title: "Base", module: "0.1", publicSummary: "", releases: [], hosted: true },
  {
    id: "fase1-ambientes",
    title: "Ambientes",
    module: "1.8",
    publicSummary: "",
    releases,
    hosted: true,
  },
];

/** Fake API holding the session state; records the PUT bodies. */
function fakeApi(initial: ArenaState = baseState) {
  let state = initial;
  const puts: { id: string; release?: string }[] = [];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (url === "/__arena/state") return json(state);
    if (url === "/__arena/scenarios") return json(summaries);
    if (url === "/__arena/scenario") {
      const body = JSON.parse(String(init?.body));
      puts.push(body);
      const scenario = summaries.find((s) => s.id === body.id)!;
      state = {
        ...state,
        scenario: body.id,
        release: body.release ?? scenario.releases[0]?.id ?? null,
        releases: scenario.releases,
        environment:
          body.id === "fase1-ambientes"
            ? { label: "qa", banner: "QA compartido" }
            : { label: "local" },
        hasRequirements: body.id === "fase1-ambientes",
        uiFlags: body.id === "fase1-ambientes" ? ["ui.some_flag"] : [],
      };
      return json(state);
    }
    if (url === "/__arena/requirements") {
      return json({
        title: "Requisitos del sprint",
        version: "2",
        items: [{ id: "REQ-1", source: "PO", text: "El envío es gratis desde 50 USD" }],
      });
    }
    return json({ error: { code: "not_found", message: url } }, 404);
  });
  return { fetchFn, puts };
}

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname + l.search}</span>;
}

function renderAt(entry: string) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ScenarioProvider>
        <ScenarioBar />
        <Where />
        <Routes>
          <Route
            path="/"
            element={
              <ScenarioSlot name="slot">
                <button>normal</button>
              </ScenarioSlot>
            }
          />
          <Route path="/requirements" element={<Requirements />} />
        </Routes>
      </ScenarioProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  for (const k of Object.keys(slotVariants)) delete slotVariants[k];
});

describe("?escenario", () => {
  it("activates the scenario from baseline and removes the parameter", async () => {
    const api = fakeApi();
    vi.stubGlobal("fetch", api.fetchFn);
    renderAt("/?escenario=fase1-ambientes");
    expect(await screen.findByTestId("env-banner")).toHaveTextContent("QA compartido");
    expect(api.puts).toEqual([{ id: "fase1-ambientes" }]);
    // The parameter is removed by a navigation after the PUT: wait for it (flaky in CI before).
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/));
    expect(screen.getByTestId("env-label")).toHaveTextContent("qa");
  });

  it("on a runner Arena drops the parameter without trying to switch scenarios", async () => {
    const api = fakeApi({ ...baseState, scenario: "runner", runnerMode: true });
    vi.stubGlobal("fetch", api.fetchFn);
    renderAt("/?escenario=fase1-ambientes");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/));
    expect(api.puts).toEqual([]);
  });

  it("ignores ids that are not slugs", async () => {
    const api = fakeApi();
    vi.stubGlobal("fetch", api.fetchFn);
    renderAt("/?escenario=../etc");
    await screen.findByTestId("scenario-bar");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/$/));
    expect(api.puts).toEqual([]);
  });

  it("asks before replacing a non-baseline scenario", async () => {
    const api = fakeApi({ ...baseState, scenario: "fase1-ambientes", releases });
    vi.stubGlobal("fetch", api.fetchFn);
    const u = userEvent.setup();
    renderAt("/?escenario=baseline");
    expect(await screen.findByTestId("scenario-confirm")).toHaveTextContent("reinicia tus datos");
    expect(api.puts).toEqual([]);
    await u.click(screen.getByTestId("scenario-confirm-load"));
    await waitFor(() => expect(api.puts).toEqual([{ id: "baseline" }]));
    expect(screen.queryByTestId("scenario-confirm")).toBeNull();
  });
});

describe("selectors", () => {
  it("switching scenario drops the token; switching only the release keeps it", async () => {
    const api = fakeApi();
    vi.stubGlobal("fetch", api.fetchFn);
    tokenStore.set("tok");
    const u = userEvent.setup();
    renderAt("/");
    await u.selectOptions(await screen.findByTestId("scenario-select"), "fase1-ambientes");
    await screen.findByTestId("release-select");
    expect(tokenStore.get()).toBeNull();

    tokenStore.set("tok");
    await u.selectOptions(screen.getByTestId("release-select"), "v1.1.0");
    await waitFor(() =>
      expect(api.puts.at(-1)).toEqual({ id: "fase1-ambientes", release: "v1.1.0" }),
    );
    expect(tokenStore.get()).toBe("tok");
  });

  it("shows the requirements link and page when the release has them", async () => {
    const api = fakeApi({
      ...baseState,
      scenario: "fase1-ambientes",
      releases,
      hasRequirements: true,
    });
    vi.stubGlobal("fetch", api.fetchFn);
    const u = userEvent.setup();
    renderAt("/");
    await u.click(await screen.findByTestId("nav-requirements"));
    expect(await screen.findByTestId("requirement-REQ-1")).toHaveTextContent("gratis desde 50");
  });
});

describe("runner mode", () => {
  it("paints no scenario control, only the neutral ready marker", async () => {
    const api = fakeApi({ ...baseState, scenario: "fase1-ambientes", releases, runnerMode: true });
    vi.stubGlobal("fetch", api.fetchFn);
    renderAt("/");
    await screen.findByTestId("arena-ready");
    for (const id of [
      "scenario-bar",
      "scenario-select",
      "release-select",
      "env-label",
      "env-banner",
    ])
      expect(screen.queryByTestId(id)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Ambientes|Jueves|qa/);
  });

  it("paints the bar and the same ready marker in the normal mode", async () => {
    vi.stubGlobal("fetch", fakeApi().fetchFn);
    renderAt("/");
    await screen.findByTestId("scenario-select");
    expect(screen.getByTestId("env-label")).toBeInTheDocument();
    expect(screen.getByTestId("arena-ready")).toBeInTheDocument();
  });
});

describe("ScenarioSlot", () => {
  it("renders the variant of an active ui flag, and the original otherwise", async () => {
    slotVariants["ui.some_flag"] = {
      slot: () => <button>variante</button>,
    };
    const api = fakeApi({ ...baseState, uiFlags: ["ui.some_flag"] });
    vi.stubGlobal("fetch", api.fetchFn);
    renderAt("/");
    expect(await screen.findByText("variante")).toBeInTheDocument();
  });

  it("keeps the original when the flag is not active", async () => {
    slotVariants["ui.some_flag"] = { slot: () => <button>variante</button> };
    vi.stubGlobal("fetch", fakeApi().fetchFn);
    renderAt("/");
    await screen.findByTestId("scenario-bar");
    expect(screen.getByText("normal")).toBeInTheDocument();
  });
});
