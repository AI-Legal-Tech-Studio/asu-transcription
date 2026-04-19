/**
 * CSRF defense via Origin/Referer header validation. Works alongside
 * SameSite=Lax session cookies as defense-in-depth.
 *
 * The browser always sets the Origin header on cross-origin POSTs (and modern
 * browsers set it on same-origin state-changing requests as well). If Origin
 * is missing we fall back to Referer. If both are missing OR they don't match
 * the request's own host, we refuse the request.
 */
export function assertSameOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  // GET/HEAD/OPTIONS should never mutate state; skip.
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const url = new URL(request.url);
  const expectedHost = url.host;

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin) {
    try {
      if (new URL(origin).host === expectedHost) return;
    } catch {
      // Malformed origin header; fall through to reject.
    }
    throw new CsrfError("Origin header does not match request host.");
  }

  if (referer) {
    try {
      if (new URL(referer).host === expectedHost) return;
    } catch {
      throw new CsrfError("Referer header is malformed.");
    }
    throw new CsrfError("Referer header does not match request host.");
  }

  throw new CsrfError("Missing Origin and Referer headers on state-changing request.");
}

export class CsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsrfError";
  }
}
