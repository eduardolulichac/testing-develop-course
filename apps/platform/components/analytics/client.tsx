"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import {
  sanitizeProperties,
  type AnalyticsEventName,
  type AnalyticsEvents,
} from "@/lib/analytics/events";

/** Browser-side event. A no-op when PostHog was not initialised (no key). */
export function trackClient<E extends AnalyticsEventName>(
  event: E,
  properties: AnalyticsEvents[E],
  options?: { sendNow?: boolean },
) {
  try {
    if (!posthog.__loaded) return;
    // `sendNow` is for events fired while the page is closing: they cannot wait in the batch queue.
    posthog.capture(
      event,
      sanitizeProperties(properties),
      options?.sendNow ? { send_instantly: true, transport: "sendBeacon" } : undefined,
    );
  } catch {
    // Ignored on purpose.
  }
}

/** Ties browser events to the internal user id (never the email). */
export function AnalyticsIdentify({ userId }: { userId: string | null }) {
  useEffect(() => {
    try {
      if (!posthog.__loaded) return;
      if (userId) posthog.identify(userId);
      else if (posthog.get_distinct_id() && posthog._isIdentified?.()) posthog.reset();
    } catch {
      // Ignored on purpose.
    }
  }, [userId]);
  return null;
}
