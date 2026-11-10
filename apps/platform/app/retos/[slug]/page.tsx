import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ChallengeCriteria, ChallengeHistory } from "@/components/challenges/challenge-history";
import { ChallengeLinkPanel } from "@/components/challenges/challenge-link-panel";
import { AiLogPanel } from "@/components/challenges/ai-log-panel";
import { PageHeader } from "@/components/page-header";
import { usesAiLog, type AiLogRow } from "@/lib/ai-logs/schema";
import { previewCriteria } from "@/lib/challenges/history";
import { getChallengeHistory } from "@/lib/challenges/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reto" };

const NOTICES: Record<string, string> = {
  error: "No pudimos iniciar la conexión con GitHub. Inténtalo de nuevo.",
  ya_vinculada: "Esa cuenta de GitHub ya está vinculada a otro estudiante.",
};

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ github?: string }> };

export default async function ChallengePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { github } = await searchParams;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/login?next=/retos/${slug}`);

  // RLS: students only see published exercises and their own links.
  const { data: exercise } = await supabase
    .from("exercises")
    .select("id, slug, criterio_aprobacion, lessons(modules(codigo))")
    .eq("slug", slug)
    .eq("tipo", "reto")
    .maybeSingle<{
      id: string;
      slug: string;
      criterio_aprobacion: unknown;
      lessons: { modules: { codigo: string } | null } | null;
    }>();
  if (!exercise) notFound();

  const identity = data.user.identities?.find((i) => i.provider === "github");
  const githubLogin =
    identity && typeof identity.identity_data?.user_name === "string"
      ? identity.identity_data.user_name
      : identity
        ? "tu cuenta"
        : null;

  const { data: link } = await supabase
    .from("challenge_links")
    .select("key_id, repo_full_name, repo_url")
    .eq("exercise_id", exercise.id)
    .is("revoked_at", null)
    .maybeSingle<{ key_id: string; repo_full_name: string; repo_url: string }>();

  const { rows, remaining } = await getChallengeHistory(supabase, exercise.id);

  let aiLogs: AiLogRow[] | null = null;
  if (usesAiLog(exercise.lessons?.modules?.codigo)) {
    const { data: logs } = await supabase
      .from("ai_logs")
      .select("id, prompt_resumen, decision, nota, created_at")
      .eq("exercise_id", exercise.id)
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<AiLogRow[]>();
    aiLogs = logs ?? [];
  }

  return (
    <>
      <PageHeader eyebrow="Reto" title={slug}>
        Vincula tu repositorio para que podamos recibir los resultados de tu evaluación.
      </PageHeader>
      <ChallengeLinkPanel
        slug={slug}
        githubLogin={githubLogin}
        link={
          link
            ? { keyId: link.key_id, repoFullName: link.repo_full_name, repoUrl: link.repo_url }
            : null
        }
        notice={github ? NOTICES[github] : undefined}
      />
      <div className="mt-8 space-y-8">
        <ChallengeCriteria criteria={previewCriteria(exercise.criterio_aprobacion)} />
        <ChallengeHistory rows={rows} remaining={remaining} />
        {aiLogs ? <AiLogPanel slug={slug} entries={aiLogs} /> : null}
      </div>
    </>
  );
}
