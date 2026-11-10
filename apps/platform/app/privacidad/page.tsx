import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Datos y privacidad" };

const SAVED = [
  "Tu correo y el método con el que iniciaste sesión (correo o Google).",
  "Tu perfil: nombre, experiencia previa y objetivo, si los completaste en el onboarding.",
  "Tu avance: lecciones iniciadas y completadas, intentos de cuestionarios y pistas de ejercicios usadas.",
  "Tus entregas de retos: repositorio, commit, resultado y detalle por criterio.",
  "Si vinculas GitHub: tu usuario y su id numérico, para comprobar que un resultado es tuyo.",
  "Tu nivel y tus puntajes por competencia, calculados a partir de tus entregas.",
  "Si lo escribes, tu registro de uso de IA en los retos de IA: lo que pediste, qué hiciste con el resultado y tus notas. Lo ves tú y puede verlo el autor al revisar tus retos; no cambia tu nota ni se envía a analítica.",
  "Un código derivado (hash) de la dirección IP de quien llama al webhook de resultados, durante un día, para limitar abusos. No es tu IP en claro.",
  "Los comentarios que decidas enviar.",
] as const;

export default function PrivacyPage() {
  return (
    <article className="max-w-2xl">
      <PageHeader eyebrow="Transparencia" title="Datos y privacidad">
        Qué guardamos, para qué y cómo pedir que lo borremos. Este curso es un piloto gratuito.
      </PageHeader>

      <div className="space-y-8 text-sm leading-relaxed">
        <section>
          <h2 className="mb-2 text-lg font-medium">Qué guardamos</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            {SAVED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium">Qué no guardamos</h2>
          <p className="text-muted">
            No pedimos datos sensibles ni de pago. Los aportes voluntarios van directo al autor por
            Yape, Plin u otro medio: la plataforma no los procesa ni los registra.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium">Analítica</h2>
          <p className="text-muted">
            Medimos cómo se usa el curso (por ejemplo, qué lecciones se abandonan) para mejorarlo.
            Los eventos se asocian a un identificador interno, nunca a tu correo. Usamos PostHog
            (servidores en Estados Unidos) como tercero: puede recibir tu dirección IP y una
            ubicación aproximada, y guarda en tu navegador una cookie y datos locales que empiezan
            por <code>ph_</code>. No grabamos tu pantalla. Si ocultas el código QR de aportes, esa
            preferencia queda solo en tu navegador.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium">Tus repositorios y la QA Arena</h2>
          <p className="text-muted">
            Los repositorios de retos son públicos, así que cualquiera puede verlos. Nunca
            ejecutamos tu código en la plataforma. La QA Arena es una app de práctica aparte: no
            uses en ella tu contraseña real ni datos personales.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium">Quién ve tus datos</h2>
          <p className="text-muted">
            Solo tú ves tu avance y tus entregas. El autor del curso puede ver datos agregados y,
            para dar soporte, tu avance individual. No vendemos ni compartimos tus datos.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-medium">Borrar tus datos</h2>
          <p className="text-muted">
            Puedes pedir que eliminemos tu cuenta y todo lo asociado escribiendo al canal de soporte
            del curso. Esta página es un aviso informativo del piloto, no un documento legal.
          </p>
        </section>

        <p>
          <Link href="/registro" className="text-accent underline-offset-4 hover:underline">
            Volver al registro
          </Link>
        </p>
      </div>
    </article>
  );
}
