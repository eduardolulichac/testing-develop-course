import { PostHog } from "posthog-node";
import { sanitizeProperties, type AnalyticsEventName, type AnalyticsEvents } from "./events";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

/**
 * Sends one event from the server. Does nothing without `NEXT_PUBLIC_POSTHOG_KEY` and never
 * throws or delays the caller for long: analytics must not break a lesson, quiz or webhook.
 */
export async function track<E extends AnalyticsEventName>(
  userId: string,
  event: E,
  properties: AnalyticsEvents[E],
): Promise<void> {
  if (!key) return;
  try {
    // Short-lived serverless functions: flush right away and always shut the client down.
    const client = new PostHog(key, { host, flushAt: 1, flushInterval: 0 });
    client.capture({
      distinctId: userId,
      event,
      properties: { ...sanitizeProperties(properties), $process_person_profile: false },
    });
    await client.shutdown(2000);
  } catch {
    // Ignored on purpose.
  }
}
