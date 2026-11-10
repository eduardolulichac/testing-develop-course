import type { Metadata } from "next";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { AuthCard } from "@/components/form";

export const metadata: Metadata = { title: "Elegir clave nueva" };

// Private route: the recovery link signs the user in through /auth/confirm first.
export default function UpdatePasswordPage() {
  return (
    <AuthCard title="Elegir clave nueva">
      <NewPasswordForm />
    </AuthCard>
  );
}
