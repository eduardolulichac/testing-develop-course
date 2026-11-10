import type { Metadata } from "next";
import Link from "next/link";
import { Divider, GoogleButton } from "@/components/auth/google-button";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { AuthCard } from "@/components/form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function SignUpPage() {
  return (
    <AuthCard title="Crear cuenta">
      <GoogleButton next="/onboarding" />
      <Divider />
      <SignUpForm />
      <p className="text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="text-accent underline-offset-4 hover:underline">
          Inicia sesión
        </Link>
      </p>
      <p className="text-xs text-muted">
        Guardamos tu correo, tu progreso y analítica de uso sin datos personales. No pedimos datos
        sensibles.{" "}
        <Link href="/privacidad" className="text-accent underline-offset-4 hover:underline">
          Ver el aviso de datos
        </Link>
        .
      </p>
    </AuthCard>
  );
}
