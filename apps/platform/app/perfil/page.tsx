import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormAlert } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "@/components/profile/profile-form";
import {
  ApprovedChallenges,
  CompetencyCards,
  LevelRequirements,
} from "@/components/profile/level-overview";
import { getLevelOverview, getOwnProfile } from "@/lib/profile/queries";
import { levelLabel } from "@/lib/profile/schema";

export const metadata: Metadata = { title: "Perfil" };

export default async function ProfilePage({ searchParams }: PageProps<"/perfil">) {
  const own = await getOwnProfile();
  if (!own) redirect("/login?next=/perfil");
  const { clave } = await searchParams;
  const { profile, email } = own;
  const level = await getLevelOverview(profile.id);

  return (
    <>
      <PageHeader eyebrow="Tu cuenta" title="Perfil" />
      <div className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
        <section aria-labelledby="resumen" className="flex flex-col gap-4">
          <h2 id="resumen" className="sr-only">
            Resumen
          </h2>
          {clave === "actualizada" ? <FormAlert message="Tu clave se actualizó." /> : null}
          <dl className="grid gap-4 rounded-lg border border-border bg-surface p-5 text-sm">
            <div>
              <dt className="text-muted">Correo</dt>
              <dd className="mt-0.5 font-medium break-all" data-testid="profile-email">
                {email ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Nivel actual</dt>
              <dd className="mt-0.5 font-medium" data-testid="profile-level">
                {levelLabel(profile.nivel_actual)}
              </dd>
              {level.headline.provisional ? (
                <dd className="mt-1 text-sm" data-testid="profile-level-provisional">
                  {level.headline.provisional}
                </dd>
              ) : (
                <dd className="mt-1 text-xs text-muted">Sube al completar retos.</dd>
              )}
            </div>
          </dl>
        </section>
        <section aria-labelledby="editar">
          <h2 id="editar" className="mb-4 font-medium">
            Tus datos
          </h2>
          <ProfileForm profile={profile} />
        </section>
      </div>
      <div className="mt-12 grid gap-10">
        <CompetencyCards cards={level.cards} />
        <LevelRequirements requirements={level.requirements} nextLevel={level.nextLevel} />
        <ApprovedChallenges approved={level.approved} />
      </div>
    </>
  );
}
