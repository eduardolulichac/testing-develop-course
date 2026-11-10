import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/form";

export const metadata: Metadata = { title: "Revisa tu correo" };

export default function VerifyEmailPage() {
  return (
    <AuthCard title="Revisa tu correo">
      <p className="text-muted">
        Te enviamos un enlace para confirmar tu cuenta. Ábrelo desde este mismo dispositivo o desde
        cualquier otro para empezar.
      </p>
      <p className="text-sm text-muted">
        ¿Ya la confirmaste?{" "}
        <Link href="/login" className="text-accent underline-offset-4 hover:underline">
          Inicia sesión
        </Link>
      </p>
    </AuthCard>
  );
}
