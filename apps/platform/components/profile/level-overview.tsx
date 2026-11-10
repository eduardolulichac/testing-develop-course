import type { getLevelOverview } from "@/lib/profile/queries";
import { levelLabel } from "@/lib/profile/schema";

type Overview = Awaited<ReturnType<typeof getLevelOverview>>;

export function CompetencyCards({ cards }: { cards: Overview["cards"] }) {
  return (
    <section aria-labelledby="competencias" className="space-y-3">
      <h2 id="competencias" className="font-medium">
        Competencias
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2" data-testid="competency-cards">
        {cards.map((c) => (
          <li
            key={c.competencia}
            className="rounded-lg border border-border bg-surface p-4 text-sm"
            data-testid={`competency-${c.competencia}`}
          >
            <h3 className="font-medium">{c.label}</h3>
            {c.data ? (
              <>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {c.data.puntaje}
                  <span className="text-sm font-normal text-muted"> / 100</span>
                </p>
                <p className="mt-1 text-muted">
                  Nivel alcanzado: {c.data.nivel} · Evidencia: {c.data.evidencia}{" "}
                  {c.data.evidencia === 1 ? "reto" : "retos"}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-muted">Sin evidencia todavía</p>
                {c.note ? <p className="mt-1 text-xs text-muted">{c.note}</p> : null}
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        El puntaje se calcula con tus retos aprobados; «Nivel alcanzado» no baja aunque el puntaje
        cambie.
      </p>
    </section>
  );
}

export function LevelRequirements({
  requirements,
  nextLevel,
}: {
  requirements: Overview["requirements"];
  nextLevel: number | null;
}) {
  if (nextLevel === null) {
    return (
      <section aria-labelledby="requisitos" className="space-y-2">
        <h2 id="requisitos" className="font-medium">
          Requisitos para subir
        </h2>
        <p className="text-sm text-muted">Ya tienes el nivel más alto. ¡Felicidades!</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="requisitos" className="space-y-3" data-testid="level-requirements">
      <h2 id="requisitos" className="font-medium">
        Para llegar a {levelLabel(nextLevel)}
      </h2>
      {requirements.length === 0 ? (
        <p className="text-sm text-muted">Cumples todo lo medible hoy. Sigue avanzando.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {requirements.map((r) => (
            <li key={r.key} className="rounded-md border border-border p-3">
              <p>{r.text}</p>
              {r.items.length > 0 ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted">
                  {r.items.map((i) => (
                    <li key={i.slug}>{i.label}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ApprovedChallenges({ approved }: { approved: Overview["approved"] }) {
  return (
    <section aria-labelledby="aprobados" className="space-y-3">
      <h2 id="aprobados" className="font-medium">
        Retos aprobados
      </h2>
      {approved.length === 0 ? (
        <p className="text-sm text-muted">Todavía no has aprobado ningún reto.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="approved-challenges">
            <caption className="sr-only">Retos aprobados con su valor para el nivel</caption>
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-1 pr-4 font-normal">
                  Reto
                </th>
                <th scope="col" className="py-1 pr-4 font-normal">
                  Intento
                </th>
                <th scope="col" className="py-1 pr-4 font-normal">
                  Puntaje
                </th>
                <th scope="col" className="py-1 pr-4 font-normal">
                  Factor
                </th>
                <th scope="col" className="py-1 font-normal">
                  Valor
                </th>
              </tr>
            </thead>
            <tbody>
              {approved.map((a) => (
                <tr key={a.slug} className="border-t border-border">
                  <th scope="row" className="py-1.5 pr-4 font-medium">
                    {a.titulo}
                  </th>
                  <td className="py-1.5 pr-4">{a.intento}</td>
                  <td className="py-1.5 pr-4">{a.puntaje}</td>
                  <td className="py-1.5 pr-4">×{a.factor}</td>
                  <td className="py-1.5 font-medium">{a.valor}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            El valor queda fijo con tu primer intento aprobado: menos intentos, más valor.
          </p>
        </div>
      )}
    </section>
  );
}
