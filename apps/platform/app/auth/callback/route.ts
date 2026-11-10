import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/routes";
import { track } from "@/lib/analytics/server";
import { postAuthPath } from "@/lib/profile/queries";
import { createClient } from "@/lib/supabase/server";

/** OAuth (Google) and PKCE redirects land here with a `code` to exchange for a session. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  // Linking GitHub to a second student: Supabase answers identity_already_exists.
  if (searchParams.get("error_code") === "identity_already_exists") {
    const back = safeNextPath(searchParams.get("next"));
    return NextResponse.redirect(new URL(`${back}?github=ya_vinculada`, request.url));
  }
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // A Google account created seconds ago is a sign-up (a returning user has an old created_at).
      const provider = data.user.app_metadata?.provider;
      if (provider === "google" && Date.now() - Date.parse(data.user.created_at) < 60_000) {
        await track(data.user.id, "signup_completed", { metodo: "google" });
      }
      const target = await postAuthPath(supabase, data.user.id, next);
      return NextResponse.redirect(new URL(target, request.url));
    }
  }

  return NextResponse.redirect(new URL("/auth/error?motivo=callback", request.url));
}
