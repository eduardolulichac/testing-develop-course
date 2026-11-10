import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/form";

export const metadata: Metadata = { title: "No pudimos completar el acceso" };

const MESSAGES: Record<string, string> = {
  enlace: "El enlace no es válido o ya caducó. Pide uno nuevo.",
  callback: "No pudimos completar el inicio de sesión. Vuelve a intentarlo.",
  google: "El acceso con Google no está disponible en este momento.",
};

export default async function AuthErrorPage({ searchParams }: PageProps<"/auth/error">) {
  const { motivo } = await searchParams;
  const message =
    (typeof motivo === "string" && MESSAGES[motivo]) || "Algo salió mal al iniciar sesión.";
  return (
    <AuthCard title="No pudimos completar el acceso">
      <p className="text-muted">{message}</p>
      <div className="flex gap-4 text-sm">
        <Link href="/login" className="text-accent underline-offset-4 hover:underline">
          Iniciar sesión
        </Link>
        <Link href="/recuperar-clave" className="text-accent underline-offset-4 hover:underline">
          Recuperar clave
        </Link>
      </div>
    </AuthCard>
  );
}
