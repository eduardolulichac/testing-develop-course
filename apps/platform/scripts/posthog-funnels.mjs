// Creates or updates the PostHog dashboard and funnels of the course (idempotent, matched by name).
// Usage: set -a && source .env.local && set +a && node scripts/posthog-funnels.mjs
// Needs POSTHOG_PERSONAL_API_KEY (scopes: insight:write, dashboard:write); never commit its value.
const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
if (!KEY) throw new Error("Falta POSTHOG_PERSONAL_API_KEY");
const PROJECT = process.env.POSTHOG_PROJECT_ID ?? "716489";
const HOST = process.env.POSTHOG_APP_HOST ?? "https://us.posthog.com";
const BASE = `${HOST}/api/projects/${PROJECT}`;
const H = { Authorization: `Bearer ${KEY}`, "content-type": "application/json" };
const api = async (method, path, body) => {
  const r = await fetch(BASE + path, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
};
const ev = (event) => ({ kind: "EventsNode", event, name: event });
const funnel = (events, extra = {}, funnelsFilter = {}) => ({
  kind: "InsightVizNode",
  source: {
    kind: "FunnelsQuery",
    series: events.map(ev),
    funnelsFilter: {
      funnelVizType: "steps",
      funnelWindowInterval: 30,
      funnelWindowIntervalUnit: "day",
      ...funnelsFilter,
    },
    dateRange: { date_from: "-90d" },
    ...extra,
  },
});
const byProp = (breakdown) => ({ breakdownFilter: { breakdown, breakdown_type: "event" } });

const INSIGHTS = [
  {
    name: "Embudo: registro → primer módulo completado",
    description:
      "signup_completed → onboarding_completed → lesson_started → lesson_completed (ventana de 30 días).",
    query: funnel([
      "signup_completed",
      "onboarding_completed",
      "lesson_started",
      "lesson_completed",
    ]),
  },
  {
    name: "Finalización por módulo (alumnos únicos)",
    description:
      "Alumnos únicos que completan una lección, por módulo. Sirve de proxy de «finalización por fase» hasta que exista phase_completed.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        series: [{ ...ev("lesson_completed"), math: "dau" }],
        trendsFilter: { display: "ActionsBarValue" },
        ...byProp("modulo"),
        dateRange: { date_from: "-90d" },
      },
    },
  },
  {
    name: "Tiempo hasta completar una lección",
    description:
      "Distribución del tiempo entre lesson_started y lesson_completed (tiempo medio en el panel).",
    query: funnel(["lesson_started", "lesson_completed"], {}, { funnelVizType: "time_to_convert" }),
  },
  {
    name: "Abandono por módulo (aproximado)",
    description:
      "lesson_started → lesson_completed por módulo; la caída es el abandono. Aproximado: lesson_abandoned aún no se envía.",
    query: funnel(["lesson_started", "lesson_completed"], byProp("modulo")),
  },
  {
    name: "Retos con más intentos fallidos",
    description: "challenge_submitted con resultado distinto de aprobado, por reto.",
    query: {
      kind: "InsightVizNode",
      source: {
        kind: "TrendsQuery",
        series: [
          {
            ...ev("challenge_submitted"),
            properties: [
              { key: "resultado", value: ["aprobado"], operator: "is_not", type: "event" },
            ],
          },
        ],
        trendsFilter: { display: "ActionsBarValue" },
        ...byProp("reto"),
        dateRange: { date_from: "-90d" },
      },
    },
  },
];

const DASH = "Curso QA: aprendizaje y retos";
const list = await api("GET", "/dashboards/?limit=100");
let dash = list.results.find((d) => d.name === DASH && !d.deleted);
if (!dash)
  dash = await api("POST", "/dashboards/", {
    name: DASH,
    description:
      "Embudos del plan (sección 9). Sin datos personales: los eventos usan el id interno del alumno.",
  });
console.log("dashboard", dash.id, dash.name);

const existing = await api("GET", "/insights/?limit=200");
for (const ins of INSIGHTS) {
  const found = existing.results.find((i) => i.name === ins.name && !i.deleted);
  const payload = {
    name: ins.name,
    description: ins.description,
    query: ins.query,
    dashboards: [dash.id],
  };
  const res = found
    ? await api("PATCH", `/insights/${found.id}/`, payload)
    : await api("POST", "/insights/", payload);
  console.log(found ? "actualizado" : "creado   ", res.id, res.short_id, ins.name);
}
console.log(`URL: ${HOST}/project/${PROJECT}/dashboard/${dash.id}`);
