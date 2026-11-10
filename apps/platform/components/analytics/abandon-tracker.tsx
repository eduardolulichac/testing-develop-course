"use client";

import { useEffect } from "react";
import { lastVisibleSection } from "@/lib/lessons/visible-section";
import { trackClient } from "./client";

/**
 * Sends `lesson_abandoned` once when the person leaves an unfinished lesson (tab closed, reload or
 * a full navigation). `seccion_visible` is the id of the last `##` heading that had reached the
 * upper half of the screen. Submitting a form (for example «Marcar como completada») is not
 * leaving. Client-side navigations do not fire `pagehide`, so they are not counted.
 */
export function AbandonTracker({
  modulo,
  leccion,
  sections,
}: {
  modulo: string;
  leccion: string;
  sections: string[];
}) {
  useEffect(() => {
    let sent = false;
    let submitting = false;
    const onSubmit = () => {
      submitting = true;
    };
    const onHide = () => {
      if (sent || submitting) return;
      sent = true;
      const tops: Record<string, number> = {};
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el) tops[id] = el.getBoundingClientRect().top;
      }
      const visible = lastVisibleSection(sections, tops, window.innerHeight);
      trackClient(
        "lesson_abandoned",
        { modulo, leccion, seccion_visible: visible },
        { sendNow: true },
      );
    };
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      window.removeEventListener("pagehide", onHide);
    };
  }, [modulo, leccion, sections]);
  return null;
}
