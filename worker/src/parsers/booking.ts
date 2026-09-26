/** Resolve only navigable web links; placeholders must never become reservation links. */
export function resolveBookingUrl(
  href: string | undefined,
  baseUrl: string,
): string | null {
  if (!href?.trim() || href.trim().startsWith("#")) return null;
  try {
    const url = new URL(href, baseUrl);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
