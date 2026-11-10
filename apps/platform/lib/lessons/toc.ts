export type TocEntry = { id: string; text: string };

/** Anchor id for a heading: lower case, accents removed, non-alphanumerics become dashes. */
export function headingId(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `## ` headings of an MDX body, ignoring fenced code blocks. */
export function extractToc(body: string): TocEntry[] {
  const entries: TocEntry[] = [];
  let fenced = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const match = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (match?.[1]) entries.push({ id: headingId(match[1]), text: match[1] });
  }
  return entries;
}
