"use client";

import { useActionState } from "react";
import { signUp, type FormState } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/schemas";
import { Field, FormAlert, SubmitButton } from "@/components/form";

export function SignUpForm() {
  const [state, action] = useActionState<FormState, FormData>(signUp, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormAlert error={state.error} />
      <Field label="Nombre" name="nombre" autoComplete="name" required maxLength={100} />
      <Field
        label="Correo"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.email}
      />
      <Field
        label="Clave"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        hint={`Al menos ${MIN_PASSWORD_LENGTH} caracteres.`}
      />
      <SubmitButton pendingLabel="Creando cuenta…">Crear cuenta</SubmitButton>
    </form>
  );
}
