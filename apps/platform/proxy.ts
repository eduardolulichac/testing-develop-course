import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Every path except static assets, image optimization files and the signed webhooks: they carry
    // no session, and the proxy would clone their body and call Supabase Auth on each request.
    "/((?!_next/static|_next/image|api/webhooks/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
