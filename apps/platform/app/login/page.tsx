import type { Metadata } from "next";
import Link from "next/link";
import { Divider, GoogleButton } from "@/components/auth/google-button";
import { SignInForm } from "@/components/auth/sign-in-form";
import { AuthCard } from "@/components/form";
import { safeNextPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  return (
    <AuthCard title="Iniciar sesión">
      <GoogleButton next={next} />
      <Divider />
      <SignInForm next={next} />
      <p className="text-sm text-muted">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="text-accent underline-offset-4 hover:underline">
          Crea una gratis
        </Link>
      </p>
    </AuthCard>
  );
}
