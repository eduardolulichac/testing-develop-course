import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-6 text-sm text-muted sm:flex-row sm:justify-between sm:px-6">
        <p>Curso gratuito de QA Automation con IA.</p>
        <p>
          Guardamos tu correo, tu progreso y analítica de uso sin datos personales.{" "}
          <Link href="/privacidad" className="text-accent underline-offset-4 hover:underline">
            Más información
          </Link>
        </p>
      </div>
    </footer>
  );
}
