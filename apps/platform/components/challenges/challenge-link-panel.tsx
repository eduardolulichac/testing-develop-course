"use client";

import { useActionState } from "react";
import { CopyPre } from "@/components/lesson/copy-pre";
import {
  connectGithub,
  disconnectGithub,
  linkRepo,
  rotateKey,
  unlinkRepo,
  type LinkState,
} from "@/app/retos/[slug]/actions";

export type ActiveLink = { keyId: string; repoFullName: string; repoUrl: string };

const button =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-accent-soft";
const primary =
  "rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-60";

function ShownKey({ keyId, secret }: { keyId: string; secret: string }) {
  return (
    <div
      data-testid="challenge-key"
      className="space-y-2 rounded-md border border-accent/40 bg-accent-soft p-3"
    >
      <p className="text-sm font-medium">Guarda esta clave ahora: no volverá a mostrarse.</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>
          En tu repositorio: <em>Settings → Secrets and variables → Actions</em>.
        </li>
        <li>
          Crea el secreto <code>COURSE_CHALLENGE_KEY</code> con este valor:
          <CopyPre data-testid="challenge-key-value" copyLabel="Copiar secreto">
            {secret}
          </CopyPre>
        </li>
        <li>
          Crea la variable <code>COURSE_KEY_ID</code> con este valor:
          <CopyPre data-testid="challenge-key-id-value" copyLabel="Copiar identificador de clave">
            {keyId}
          </CopyPre>
        </li>
      </ol>
    </div>
  );
}

/**
 * GitHub account + repository linking for a challenge. The key is derived on the server and only
 * returned by the action that creates or rotates it.
 */
export function ChallengeLinkPanel({
  slug,
  githubLogin,
  link,
  notice,
}: {
  slug: string;
  githubLogin: string | null;
  link: ActiveLink | null;
  notice?: string;
}) {
  const [linked, linkAction, linking] = useActionState<LinkState, FormData>(linkRepo, null);
  const [rotated, rotateAction, rotating] = useActionState<LinkState, FormData>(rotateKey, null);
  const shown = linked?.key ? linked : rotated?.key ? rotated : null;

  return (
    <section
      aria-labelledby="vinculo-titulo"
      data-testid="challenge-link-panel"
      className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5"
    >
      <h2 id="vinculo-titulo" className="text-lg font-semibold">
        Tu repositorio
      </h2>
      {notice ? (
        <p
          role="status"
          className="rounded-md bg-danger-soft p-3 text-sm"
          data-testid="challenge-notice"
        >
          {notice}
        </p>
      ) : null}

      {!githubLogin ? (
        <form action={connectGithub} className="space-y-2">
          <input type="hidden" name="slug" value={slug} />
          <p className="text-sm">
            Conecta tu cuenta de GitHub para vincular el repositorio de este reto. Solo pedimos tu
            perfil y tu correo, nunca acceso a tus repositorios.
          </p>
          <button type="submit" className={primary}>
            Conectar GitHub
          </button>
        </form>
      ) : (
        <>
          <p className="text-sm" data-testid="github-account">
            Cuenta de GitHub conectada: <strong>{githubLogin}</strong>
          </p>
          {link ? (
            <div className="space-y-3">
              <p className="text-sm" data-testid="linked-repo">
                Repositorio vinculado:{" "}
                <a className="underline" href={link.repoUrl} rel="noopener noreferrer">
                  {link.repoFullName}
                </a>{" "}
                · Clave <code>{link.keyId}</code>
              </p>
              {shown?.key && shown.keyId ? (
                <ShownKey keyId={shown.keyId} secret={shown.key} />
              ) : null}
              <div className="flex flex-wrap gap-3">
                <form action={rotateAction}>
                  <input type="hidden" name="slug" value={slug} />
                  <button type="submit" className={button} disabled={rotating}>
                    Rotar clave
                  </button>
                </form>
                <form action={unlinkRepo}>
                  <input type="hidden" name="slug" value={slug} />
                  <button type="submit" className={button}>
                    Desvincular repositorio
                  </button>
                </form>
              </div>
              {rotated?.error ? (
                <p role="alert" className="text-sm text-danger">
                  {rotated.error}
                </p>
              ) : null}
            </div>
          ) : (
            <form action={linkAction} className="space-y-2">
              <input type="hidden" name="slug" value={slug} />
              <label className="block text-sm font-medium" htmlFor="repo-url">
                URL de tu repositorio (público, creado desde la plantilla)
              </label>
              <input
                id="repo-url"
                name="repo"
                type="url"
                required
                placeholder="https://github.com/tu-usuario/reto-1-1-login"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <button type="submit" className={primary} disabled={linking}>
                {linking ? "Vinculando…" : "Vincular repositorio"}
              </button>
              {linked?.error ? (
                <p role="alert" className="text-sm text-danger">
                  {linked.error}
                </p>
              ) : null}
            </form>
          )}
          <form action={disconnectGithub}>
            <input type="hidden" name="slug" value={slug} />
            <button type="submit" className="text-sm text-muted underline">
              Desconectar GitHub
            </button>
          </form>
        </>
      )}
    </section>
  );
}
