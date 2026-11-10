import {
  OUTCOME_LABEL,
  STATUS_LABEL,
  criteriaOf,
  githubLinks,
  statusMessage,
  type CriterionPreview,
  type SubmissionRow,
} from "@/lib/challenges/history";

const dateFormat = new Intl.DateTimeFormat("es", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function ChallengeCriteria({ criteria }: { criteria: CriterionPreview[] }) {
  if (criteria.length === 0) return null;
  return (
    <section aria-labelledby="criterios" className="space-y-2" data-testid="challenge-criteria">
      <h2 id="criterios" className="text-lg font-semibold">
        Qué se evalúa
      </h2>
      <ul className="divide-y divide-border rounded-md border border-border">
        {criteria.map((c) => (
          <li key={c.id} className="flex items-baseline justify-between gap-4 px-3 py-2 text-sm">
            <span>
              {c.titulo}
              {c.obligatorio ? (
                <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs">
                  obligatorio
                </span>
              ) : null}
            </span>
            <span className="text-muted">{c.peso} pts</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Submission({ row }: { row: SubmissionRow }) {
  const verified = row.estado_verificacion === "verificado";
  const links = githubLinks(row.repo_url, row.commit_sha, row.run_id);
  const criteria = verified ? criteriaOf(row.detalle_json) : [];
  const note = statusMessage(row);
  return (
    <li
      className="space-y-2 rounded-md border border-border p-3"
      data-testid="submission"
      data-resultado={row.resultado ?? row.estado_verificacion}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">
          {verified && row.resultado ? OUTCOME_LABEL[row.resultado] : "Sin resultado"}
          {verified && row.puntaje !== null ? ` · ${Number(row.puntaje)} / 100` : ""}
          {row.intento ? ` · intento ${row.intento}` : ""}
        </span>
        <span className="text-muted">
          {dateFormat.format(new Date(row.created_at))} UTC ·{" "}
          {links.commit ? (
            <a href={links.commit} className="font-mono text-accent" rel="noreferrer">
              {row.commit_sha.slice(0, 7)}
            </a>
          ) : (
            <span className="font-mono">{row.commit_sha.slice(0, 7)}</span>
          )}
          {links.run ? (
            <>
              {" · "}
              <a href={links.run} className="text-accent" rel="noreferrer">
                ejecución
              </a>
            </>
          ) : null}
        </span>
      </div>
      {note ? <p className="text-sm text-muted">{note}</p> : null}
      {verified && row.resultado === "error" ? (
        <p className="text-sm text-muted">
          Fue un fallo del entorno de evaluación, no tuyo: no cuenta para tu nivel. Vuelve a lanzar
          el workflow.
        </p>
      ) : null}
      {criteria.length > 0 ? (
        <ul className="space-y-1.5 text-sm">
          {criteria.map((c) => (
            <li key={c.id} data-testid="submission-criterion" data-status={c.status}>
              <span className="font-medium">{STATUS_LABEL[c.status]}</span> · {c.titulo ?? c.id}
              {c.evidence ? <span className="block text-muted">{c.evidence}</span> : null}
              {c.status === "fail" && c.feedback_fallo ? (
                <span className="block text-foreground">Pista: {c.feedback_fallo}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ChallengeHistory({
  rows,
  remaining,
}: {
  rows: SubmissionRow[];
  remaining: number;
}) {
  return (
    <section aria-labelledby="historial" className="space-y-3" data-testid="challenge-history">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="historial" className="text-lg font-semibold">
          Tus entregas
        </h2>
        <p className="text-sm text-muted" data-testid="submissions-remaining">
          Te quedan {remaining} {remaining === 1 ? "envío" : "envíos"} esta hora
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          Aún no has entregado. Haz <code>push</code> a <code>main</code> en tu repositorio y el
          resultado aparecerá aquí.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <Submission key={r.id} row={r} />
          ))}
        </ul>
      )}
    </section>
  );
}
