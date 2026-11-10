import { signInWithGoogle } from "@/lib/auth/actions";

export function GoogleButton({ next }: { next?: string }) {
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="next" value={next ?? ""} />
      <button
        type="submit"
        className="h-11 w-full rounded-md border border-border bg-surface px-4 font-medium hover:bg-accent-soft"
      >
        Continuar con Google
      </button>
    </form>
  );
}

export function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
    </div>
  );
}
