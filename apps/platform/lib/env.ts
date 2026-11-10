/**
 * Public Supabase settings. Only `NEXT_PUBLIC_*` values may be read here because this
 * module is imported by browser code too. The secret key is never read in this file.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const hasSupabaseEnv = Boolean(supabaseUrl && supabasePublishableKey);

/** Base URL used to build auth redirect links (email confirmation, OAuth, password reset). */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100").replace(/\/$/, "");
}
