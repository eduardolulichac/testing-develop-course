"use client";

import { useActionState } from "react";
import { requestPasswordReset, type FormState } from "@/lib/auth/actions";
import { Field, FormAlert, SubmitButton } from "@/components/form";

export function ResetRequestForm() {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordReset, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormAlert error={state.error} message={state.message} />
      <Field label="Correo" name="email" type="email" autoComplete="email" required />
      <SubmitButton pendingLabel="Enviando…">Enviar enlace</SubmitButton>
    </form>
  );
}
