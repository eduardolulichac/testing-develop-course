/** Public routes that never require a session. Everything else is private. */
export const PUBLIC_PATHS = [
  "/",
  "/login",
  "/registro",
  "/recuperar-clave",
  "/verifica-tu-correo",
  "/muestra",
  "/privacidad",
  "/auth/confirm",
  "/auth/callback",
  "/auth/error",
] as const;

/** Routes only meant for signed-out visitors; signed-in users are sent to the roadmap. */
export const GUEST_ONLY_PATHS = ["/login", "/registro", "/recuperar-clave"] as const;

export const DEFAULT_AFTER_LOGIN = "/roadmap";

function matches(pathname: string, list: readonly string[]): boolean {
  return list.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)));
}

export function isPublicPath(pathname: string): boolean {
  return matches(pathname, PUBLIC_PATHS);
}

export function isGuestOnlyPath(pathname: string): boolean {
  return matches(pathname, GUEST_ONLY_PATHS);
}

/**
 * Returns a safe, same-origin relative path for post-auth redirects.
 * Rejects absolute URLs, protocol-relative URLs (`//evil.com`) and backslash tricks
 * to avoid open redirects through the `next` query parameter.
 */
export function safeNextPath(next: string | null | undefined, fallback = DEFAULT_AFTER_LOGIN) {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  try {
    const url = new URL(next, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
