export type DonationOption = { id: "yape" | "plin" | "internacional"; label: string; src: string };

/** Only a same-site path or an https URL may be used as an image source. */
export function safeImageSrc(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (v.startsWith("/") && !v.startsWith("//") && !v.includes("\\")) return v;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

/** QR images configured through `NEXT_PUBLIC_QR_*_URL`; unset or invalid entries are skipped. */
export function donationOptions(
  env: Record<string, string | undefined> = process.env,
): DonationOption[] {
  const entries: [DonationOption["id"], string, string | undefined][] = [
    ["yape", "Yape", env.NEXT_PUBLIC_QR_YAPE_URL],
    ["plin", "Plin", env.NEXT_PUBLIC_QR_PLIN_URL],
    ["internacional", "Internacional", env.NEXT_PUBLIC_QR_INTERNATIONAL_URL],
  ];
  return entries.flatMap(([id, label, raw]) => {
    const src = safeImageSrc(raw);
    return src ? [{ id, label, src }] : [];
  });
}
