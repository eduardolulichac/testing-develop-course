"use client";

import { useActionState } from "react";
import { FormAlert, SubmitButton } from "@/components/form";
import { completeOnboarding, type ProfileFormState } from "@/lib/profile/actions";
import { ExperienceField, GoalField } from "./profile-fields";

export function OnboardingForm({ next }: { next: string }) {
  const [state, action] = useActionState<ProfileFormState, FormData>(completeOnboarding, {});
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <FormAlert error={state.error} />
      <input type="hidden" name="next" value={next} />
      <ExperienceField />
      <GoalField />
      <SubmitButton pendingLabel="Guardando…">Empezar el curso</SubmitButton>
    </form>
  );
}
