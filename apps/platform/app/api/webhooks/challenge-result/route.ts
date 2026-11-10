import { handleChallengeResult } from "@/lib/challenges/webhook";
import { createWebhookDeps } from "@/lib/challenges/webhook-deps";

// Node runtime: the signature is computed over the exact bytes of the body.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    return await handleChallengeResult(request, createWebhookDeps());
  } catch (error) {
    // Nothing from the request or the error reaches the response.
    console.error(
      JSON.stringify({
        scope: "challenge-webhook",
        event: "internal_error",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

export function GET() {
  return Response.json({ error: "method_not_allowed" }, { status: 405 });
}
