"use client";

import { useActionState } from "react";
import { updatePassword, type FormState } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/schemas";
import { Field, FormAlert, SubmitButton } from "@/components/form";

export function NewPasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(updatePassword, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormAlert error={state.error} />
      <Field
        label="Clave nueva"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        hint={`Al menos ${MIN_PASSWORD_LENGTH} caracteres.`}
      />
      <Field
        label="Repite la clave"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
      />
      <SubmitButton pendingLabel="Guardando…">Guardar clave</SubmitButton>
    </form>
  );
}
