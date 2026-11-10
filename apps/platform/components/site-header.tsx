import Link from "next/link";
import { AnalyticsIdentify } from "@/components/analytics/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/lib/auth/actions";
import { hasSupabaseEnv } from "@/lib/env";
import { getCurrentUserId } from "@/lib/supabase/server";

const NAV_LINKS = [
  { href: "/roadmap", label: "Roadmap" },
  { href: "/perfil", label: "Perfil" },
] as const;

const linkClass =
  "rounded-md px-3 py-2 text-left text-sm font-medium text-muted hover:bg-accent-soft hover:text-foreground";

function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className={`${linkClass} w-full`}>
        Cerrar sesión
      </button>
    </form>
  );
}

export async function SiteHeader() {
  const userId = hasSupabaseEnv ? await getCurrentUserId() : null;
  const signedIn = Boolean(userId);

  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur">
      <AnalyticsIdentify userId={userId} />
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href={signedIn ? "/roadmap" : "/"}
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span
            aria-hidden="true"
            className="grid h-7 w-7 place-items-center rounded-md bg-accent font-mono text-xs text-accent-foreground"
          >
            QA
          </span>
          <span className="hidden sm:inline">QA Automation con IA</span>
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex" data-testid="session-actions">
            {signedIn ? (
              <SignOutButton />
            ) : (
              <>
                <Link href="/login" className={linkClass}>
                  Iniciar sesión
                </Link>
                <Link
                  href="/registro"
                  className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
                >
                  Crear cuenta
                </Link>
              </>
            )}
          </div>
          <ThemeToggle />
          <details className="relative md:hidden">
            <summary
              aria-label="Abrir menú"
              className="inline-flex h-9 cursor-pointer list-none items-center rounded-md border border-border px-3 text-sm [&::-webkit-details-marker]:hidden"
            >
              Menú
            </summary>
            <nav
              aria-label="Menú móvil"
              className="absolute right-0 z-40 mt-2 flex w-52 flex-col rounded-md border border-border bg-surface p-2 shadow-lg"
            >
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className={linkClass}>
                  {link.label}
                </Link>
              ))}
              {signedIn ? (
                <SignOutButton />
              ) : (
                <>
                  <Link href="/login" className={linkClass}>
                    Iniciar sesión
                  </Link>
                  <Link href="/registro" className={linkClass}>
                    Crear cuenta
                  </Link>
                </>
              )}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
