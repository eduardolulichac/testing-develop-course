import { expect } from "@playwright/test";

/** Local inbox of Supabase (Mailpit). Port set in supabase/config.toml ([local_smtp]). */
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:55324";

type MailpitSummary = { ID: string; Subject: string };

/** Waits for the newest email sent to `to` (optionally with a subject) and returns its HTML. */
export async function waitForEmail(to: string, subject?: string): Promise<string> {
  let html = "";
  await expect
    .poll(
      async () => {
        const query = encodeURIComponent(`to:"${to}"${subject ? ` subject:"${subject}"` : ""}`);
        const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
        const body = (await res.json()) as { messages: MailpitSummary[] };
        const latest = body.messages[0];
        if (!latest) return false;
        const message = (await (
          await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`)
        ).json()) as {
          HTML: string;
        };
        html = message.HTML;
        return true;
      },
      { message: `email to ${to}`, timeout: 15_000 },
    )
    .toBe(true);
  return html;
}

/** Extracts the first link of an email body (the confirmation or recovery link). */
export function firstLink(html: string): string {
  const href = /href="([^"]+)"/.exec(html)?.[1];
  if (!href) throw new Error("No link found in email");
  return href.replaceAll("&amp;", "&");
}
