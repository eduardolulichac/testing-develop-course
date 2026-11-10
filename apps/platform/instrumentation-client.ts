import posthog from "posthog-js";

// Only the events defined in lib/analytics/events.ts are sent: no autocapture, no automatic
// pageviews, no session recording, no surveys. Without a key nothing is initialised.
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (key) {
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    defaults: "2026-08-30",
    person_profiles: "identified_only",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
  });
}
