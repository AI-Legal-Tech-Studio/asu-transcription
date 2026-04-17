import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "clinic-audio-session";

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
 * Verify a session token. Returns the payload on success, null on failure.
 */
async function verifySessionToken(
  token?: string | null,
): Promise<{ email: string } | null> {
  const key = getSessionKey();
  if (!key || !token) return null;

  try {
    const { payload } = await jwtVerify(token, key);
    if (payload.scope !== SESSION_SCOPE || typeof payload.sub !== "string") {
      return null;
    }
    return { email: payload.sub };
  } catch {
    return null;
  }
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
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
