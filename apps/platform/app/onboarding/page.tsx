import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/form";
import { OnboardingForm } from "@/components/profile/onboarding-form";
import { getOwnProfile } from "@/lib/profile/queries";
import { safeNextPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Bienvenida" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const own = await getOwnProfile();
  if (!own) redirect("/login?next=/onboarding");
  if (own.profile.onboarding_completed_at) redirect(next);

  const greeting = own.profile.nombre ? `Hola, ${own.profile.nombre}` : "Te damos la bienvenida";
  return (
    <AuthCard title={greeting}>
      <p className="text-muted">
        Dos preguntas rápidas para adaptar el curso a ti. Puedes cambiarlas luego en tu perfil.
      </p>
      <OnboardingForm next={next} />
    </AuthCard>
  );
}
