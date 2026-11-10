"use client";

import { useActionState } from "react";
import { Field, FormAlert, SubmitButton } from "@/components/form";
import { updateProfile, type ProfileFormState } from "@/lib/profile/actions";
import type { Profile } from "@/lib/profile/queries";
import { ExperienceField, GoalField } from "./profile-fields";

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState<ProfileFormState, FormData>(updateProfile, {});
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <FormAlert error={state.error} message={state.message} />
      <Field
        label="Nombre"
        name="nombre"
        autoComplete="name"
        maxLength={100}
        required
        defaultValue={profile.nombre ?? ""}
      />
      <ExperienceField defaultValue={profile.experiencia_previa} />
      <GoalField defaultValue={profile.objetivo} />
      <SubmitButton pendingLabel="Guardando…">Guardar cambios</SubmitButton>
    </form>
  );
}
