import type { Metadata } from "next";
import Link from "next/link";
import { ResetRequestForm } from "@/components/auth/reset-request-form";
import { AuthCard } from "@/components/form";

export const metadata: Metadata = { title: "Recuperar clave" };

export default function ResetRequestPage() {
  return (
    <AuthCard title="Recuperar clave">
      <p className="text-muted">Te enviaremos un enlace para elegir una clave nueva.</p>
      <ResetRequestForm />
      <Link href="/login" className="text-sm text-accent underline-offset-4 hover:underline">
        Volver a iniciar sesión
      </Link>
    </AuthCard>
  );
}
