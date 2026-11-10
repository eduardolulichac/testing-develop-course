import { useEffect, useState } from "react";
import { api, ApiError, type Requirements as RequirementsDoc } from "../api";

export function Requirements() {
  const [doc, setDoc] = useState<RequirementsDoc | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    api<RequirementsDoc>("GET", "/__arena/requirements")
      .then(setDoc)
      .catch((e) => setMissing(e instanceof ApiError && e.status === 404));
  }, []);
  if (missing) return <p data-testid="requirements-empty">Este escenario no tiene requisitos.</p>;
  if (!doc) return <p data-testid="requirements-loading">Cargando...</p>;
  return (
    <section>
      <h1>{doc.title}</h1>
      <p data-testid="requirements-version">Versión {doc.version}</p>
      <ul className="list" data-testid="requirements-list">
        {doc.items.map((i) => (
          <li key={i.id} className="card" data-testid={`requirement-${i.id}`}>
            <strong>{i.id}</strong> <em>({i.source})</em>
            <p>{i.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
