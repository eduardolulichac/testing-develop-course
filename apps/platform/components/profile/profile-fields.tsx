import { EXPERIENCE_OPTIONS } from "@/lib/profile/schema";

export function ExperienceField({ defaultValue }: { defaultValue?: string | null }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">¿Cuál es tu experiencia previa?</legend>
      {EXPERIENCE_OPTIONS.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
        >
          <input
            type="radio"
            name="experiencia_previa"
            value={option.value}
            defaultChecked={defaultValue === option.value}
            className="accent-[var(--accent)]"
            required
          />
          <span className="text-sm">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function GoalField({ defaultValue }: { defaultValue?: string | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="objetivo" className="text-sm font-medium">
        ¿Qué quieres lograr con el curso?
      </label>
      <textarea
        id="objetivo"
        name="objetivo"
        rows={3}
        maxLength={500}
        required
        defaultValue={defaultValue ?? ""}
        placeholder="Por ejemplo: conseguir mi primer trabajo como QA Automation."
        className="rounded-md border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent"
      />
    </div>
  );
}
