"use client";

import { useActionState, useRef } from "react";
import {
  addAiLog,
  deleteAiLog,
  updateAiLog,
  type AiLogState,
} from "@/app/retos/[slug]/ai-log-actions";
import {
  AI_LOG_DECISIONS,
  DECISION_LABELS,
  MAX_AI_LOGS_PER_CHALLENGE,
  type AiLogRow,
} from "@/lib/ai-logs/schema";

const control =
  "rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const button =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-accent-soft";
const primary =
  "rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-60";

const dateFormat = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" });

function Fields({ slug, entry, prefix }: { slug: string; entry?: AiLogRow; prefix: string }) {
  return (
    <>
      <input type="hidden" name="slug" value={slug} />
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${prefix}-prompt`} className="text-sm font-medium">
          ¿Qué le pediste a la IA?
        </label>
        <textarea
          id={`${prefix}-prompt`}
          name="prompt_resumen"
          required
          minLength={10}
          maxLength={2000}
          rows={3}
          defaultValue={entry?.prompt_resumen}
          className={control}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${prefix}-decision`} className="text-sm font-medium">
          ¿Qué hiciste con el resultado?
        </label>
        <select
          id={`${prefix}-decision`}
          name="decision"
          required
          defaultValue={entry?.decision ?? ""}
          className={control}
        >
          <option value="" disabled>
            Elige una opción
          </option>
          {AI_LOG_DECISIONS.map((d) => (
            <option key={d} value={d}>
              {DECISION_LABELS[d]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${prefix}-nota`} className="text-sm font-medium">
          ¿Qué corregiste o por qué lo rechazaste? <span className="text-muted">(opcional)</span>
        </label>
        <textarea
          id={`${prefix}-nota`}
          name="nota"
          maxLength={2000}
          rows={2}
          defaultValue={entry?.nota ?? ""}
          className={control}
        />
      </div>
    </>
  );
}

function AddForm({ slug, full }: { slug: string; full: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: AiLogState, formData: FormData) => {
    const next = await addAiLog(prev, formData);
    if (next?.ok) formRef.current?.reset();
    return next;
  }, null);
  if (full) {
    return (
      <p className="text-sm text-muted">
        Llegaste al máximo de {MAX_AI_LOGS_PER_CHALLENGE} entradas en este reto. Borra alguna para
        añadir otra.
      </p>
    );
  }
  return (
    <form ref={formRef} action={action} className="space-y-3" data-testid="ai-log-form">
      <Fields slug={slug} prefix="nuevo" />
      {state?.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Guardando…" : "Añadir al registro"}
      </button>
    </form>
  );
}

function EditForm({ slug, entry }: { slug: string; entry: AiLogRow }) {
  const [state, action, pending] = useActionState(updateAiLog, null);
  return (
    <form action={action} className="mt-3 space-y-3">
      <Fields slug={slug} entry={entry} prefix={`e-${entry.id}`} />
      {state?.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}

export function AiLogPanel({ slug, entries }: { slug: string; entries: AiLogRow[] }) {
  return (
    <section aria-labelledby="registro-ia" className="space-y-4" data-testid="ai-log-panel">
      <div>
        <h2 id="registro-ia" className="text-lg font-semibold">
          Registro de uso de IA
        </h2>
        <p className="mt-1 text-sm text-muted">
          Cuenta cómo usaste la IA en este reto. No pegues claves ni datos personales. Esto no
          cambia tu nota.
        </p>
      </div>
      <AddForm slug={slug} full={entries.length >= MAX_AI_LOGS_PER_CHALLENGE} />
      {entries.length > 0 ? (
        <ul className="space-y-3" data-testid="ai-log-list">
          {entries.map((e) => (
            <li key={e.id} className="rounded-md border border-border p-3 text-sm">
              <p className="text-xs text-muted">
                {dateFormat.format(new Date(e.created_at))} · {DECISION_LABELS[e.decision]}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{e.prompt_resumen}</p>
              {e.nota ? <p className="mt-1 whitespace-pre-wrap text-muted">{e.nota}</p> : null}
              <div className="mt-2 flex flex-wrap items-start gap-2">
                <details className="flex-1">
                  <summary className={`${button} inline-block cursor-pointer`}>Editar</summary>
                  <EditForm slug={slug} entry={e} />
                </details>
                <form action={deleteAiLog}>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="id" value={e.id} />
                  <button type="submit" className={button}>
                    Borrar
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
