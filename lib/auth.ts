import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { getDb } from "@/lib/db";

// The `__Host-` prefix (RFC 6265bis) binds the cookie to a single origin:
// the browser refuses to accept it unless Secure is set, Path=/, and no
// Domain attribute is present. This prevents subdomain-takeover cookie
// injection. In local non-HTTPS dev we fall back to the unprefixed name.
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-clinic-audio-session"
    : "clinic-audio-session";

const SESSION_SCOPE = "clinic-access";
const SESSION_DURATION_SECONDS = 60 * 60 * 12; // 12 hours

function getSessionSecret() {
  return process.env.SESSION_SECRET?.trim() ?? "";
}

function getSessionKey() {
  const secret = getSessionSecret();
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

/**
 * Create a signed JWT that includes the user's email.
 */
export async function createSessionToken(email: string) {
  const key = getSessionKey();
  if (!key) {
    throw new Error("SESSION_SECRET is required to create a signed session.");
  }

  return new SignJWT({ scope: SESSION_SCOPE, sub: email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(key);
}

/**
 * Ensure a User row exists for this email so we have somewhere to hang
 * revocation state. No-op if the row already exists.
 */
export async function ensureUserRecord(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return;
  const db = getDb();
  await db.user.upsert({
    where: { email: normalizedEmail },
    create: { email: normalizedEmail },
    update: {},
  });
}

/**
 * Invalidate every currently-outstanding JWT for this user by bumping the
 * revocation timestamp past any possible iat. Called on logout and
 * callable from ops scripts after a password rotation.
 */
export async function revokeUserSessions(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return;
  const db = getDb();
  const now = new Date();
  await db.user.upsert({
    where: { email: normalizedEmail },
    create: { email: normalizedEmail, sessionsRevokedAt: now },
    update: { sessionsRevokedAt: now },
  });
}

async function getUserRevokedAt(email: string): Promise<Date | null> {
  try {
    const db = getDb();
    const row = await db.user.findUnique({
      where: { email },
      select: { sessionsRevokedAt: true },
    });
    return row?.sessionsRevokedAt ?? null;
  } catch (error) {
    // Fail open: if the DB is unreachable we trust the JWT signature alone
    // rather than locking every user out. Log so the failure is visible.
    console.error("[auth] revocation lookup failed", error);
    return null;
  }
}

/**
 * Verify a session token. Returns the payload on success, null on failure.
 *
 * On top of the cryptographic check we also consult the database for a
 * per-user revocation timestamp — this is what turns stateless JWTs into
 * practically-revocable sessions without sacrificing the fast path.
 */
async function verifySessionToken(
  token?: string | null,
): Promise<{ email: string } | null> {
  const key = getSessionKey();
  if (!key || !token) return null;

  let payloadIat: number | undefined;
  let payloadSub: string;
  try {
    const { payload } = await jwtVerify(token, key);
    if (payload.scope !== SESSION_SCOPE || typeof payload.sub !== "string") {
      return null;
    }
    payloadSub = payload.sub;
    payloadIat = typeof payload.iat === "number" ? payload.iat : undefined;
  } catch {
    return null;
  }

  const email = payloadSub.trim().toLowerCase();
  const revokedAt = await getUserRevokedAt(email);

  if (revokedAt && payloadIat !== undefined) {
    // iat is in seconds, revokedAt.getTime() is milliseconds.
    if (payloadIat * 1000 < revokedAt.getTime()) {
      return null;
    }
  }

  return { email };
}

/**
 * Check whether the current request has a valid session.
 */
export async function isAuthenticated() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const result = await verifySessionToken(token);
  return result !== null;
}

/**
 * Get the current user's email from the session, or null if not authenticated.
 */
export async function getCurrentUser(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const result = await verifySessionToken(token);
  return result?.email ?? null;
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
    // Lax lets top-level navigation from the login redirect keep the cookie,
    // but blocks it from sub-resource cross-site requests. Combined with
    // `assertSameOrigin` on every state-changing route, CSRF is covered.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
