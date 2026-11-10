"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type FormState } from "@/lib/auth/actions";
import { Field, FormAlert, SubmitButton } from "@/components/form";

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(signIn, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormAlert error={state.error} />
      <input type="hidden" name="next" value={next ?? ""} />
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
        autoComplete="current-password"
        required
      />
      <div className="-mt-2 text-right text-sm">
        <Link href="/recuperar-clave" className="text-accent underline-offset-4 hover:underline">
          ¿Olvidaste tu clave?
        </Link>
      </div>
      <SubmitButton pendingLabel="Entrando…">Iniciar sesión</SubmitButton>
    </form>
  );
}
