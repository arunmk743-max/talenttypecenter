/** Check browser request provenance without assuming a proxy preserves the public URL. */
export function isSameOriginRequest(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin || origin === 'null') return false;
  try {
    const parsed = new URL(origin);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.origin !== origin) return false;
  } catch { return false; }

  // Browsers set this forbidden request header from the public target URL. A
  // reverse proxy may change req.url's host or scheme before invoking a function.
  // Cross-site and same-site (different origin) requests are deliberately denied.
  const site = req.headers.get('sec-fetch-site');
  if (site !== null) return site === 'same-origin';

  // Older clients without Fetch Metadata retain the strict URL comparison.
  return origin === new URL(req.url).origin;
}
