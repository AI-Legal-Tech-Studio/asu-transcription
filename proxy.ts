import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16 Routing Proxy. Runs on every matched route and attaches a
 * baseline set of security headers. Authentication is still enforced inside
 * each route handler via `getCurrentUser()`; this proxy is defense-in-depth.
 */
const SECURITY_HEADERS: Record<string, string> = {
  // Disallow embedding in iframes (clickjacking).
  "X-Frame-Options": "DENY",
  // Prevent MIME-sniffing content types.
  "X-Content-Type-Options": "nosniff",
  // Only send the origin as referrer, and never cross-origin downgrade.
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Opt out of powerful APIs we never use.
  "Permissions-Policy": [
    "camera=()",
    "geolocation=()",
    "microphone=()",
    "payment=()",
    "usb=()",
    "interest-cohort=()",
  ].join(", "),
  // Force HTTPS for two years, include subdomains, opt into preload list.
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  // Isolate cross-origin windows and resources.
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  // Conservative CSP: self-only, inline styles allowed (Next font loader),
  // blob/data for audio previews, API calls to self and Vercel Blob only.
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
    "connect-src 'self' https://vercel.com https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; "),
};

// Skip static assets and Next.js internals — nothing to protect there.
function shouldSkip(pathname: string) {
  return (
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/icon.svg" ||
    pathname === "/favicon.ico"
  );
}

export default function proxy(request: NextRequest) {
  const response = NextResponse.next();

  if (shouldSkip(request.nextUrl.pathname)) {
    return response;
  }

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
}
