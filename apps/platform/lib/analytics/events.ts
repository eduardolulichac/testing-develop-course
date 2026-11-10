/**
 * Analytics events of the course (PLAN_DESARROLLO.md section 9). Properties are small scalars and
 * never carry an email or any free text from the student; the person is the internal user id.
 */
export type AnalyticsEvents = {
  signup_completed: { metodo: "correo" | "google" };
  onboarding_completed: { experiencia_previa: string };
  lesson_started: { modulo: string; leccion: string };
  lesson_completed: { modulo: string; leccion: string; tiempo_seg: number };
  lesson_abandoned: { modulo: string; leccion: string; seccion_visible: string };
  feedback_submitted: { modulo: string; rating: number };
  phase_completed: { fase: number; dias_desde_inicio: number };
  quiz_submitted: { modulo: string; leccion: string; nota: number; intentos: number };
  hint_used: { ejercicio: string; nivel_pista: number };
  challenge_submitted: { reto: string; resultado: string; intento: number | null };
  level_up: { nivel: number; tipo: "confirmado" | "provisional" };
  ai_log_added: { reto: string; decision: string };
  arena_opened: { escenario: string };
  donation_qr_viewed: { ubicacion: string };
  donation_qr_dismissed: { ubicacion: string };
};

export type AnalyticsEventName = keyof AnalyticsEvents;

const FORBIDDEN_KEY = /mail|correo_electronico|password|clave|token/i;
const EMAIL_VALUE = /\S+@\S+\.\S+/;

/** Last line of defence: drops any property that looks like an email or a secret. */
export function sanitizeProperties(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (FORBIDDEN_KEY.test(key)) continue;
    if (typeof value === "string" && EMAIL_VALUE.test(value)) continue;
    out[key] = value;
  }
  return out;
}
