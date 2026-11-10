/** Same shape the content validator uses for scenario ids (kebab-case slug). */
const SCENARIO_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Builds the QA Arena link for a scenario: `<NEXT_PUBLIC_ARENA_URL>/?escenario=<id>`.
 * Returns null when the Arena URL is missing/invalid or the scenario id is malformed, so the
 * UI can degrade instead of rendering a broken link. The scenario engine does not exist yet:
 * this only builds the URL.
 */
export function buildArenaUrl(
  escenario: string,
  base: string | undefined = process.env.NEXT_PUBLIC_ARENA_URL,
): string | null {
  if (!base?.trim() || !SCENARIO_ID.test(escenario)) return null;
  try {
    const url = new URL(base.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.searchParams.set("escenario", escenario);
    return url.toString();
  } catch {
    return null;
  }
}
