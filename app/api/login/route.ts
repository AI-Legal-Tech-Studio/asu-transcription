import { NextResponse } from "next/server";
import { z } from "zod";

import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  ensureUserRecord,
  getSessionCookieOptions,
} from "@/lib/auth";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { hasSessionSecret, hasUsers, validateCredentials } from "@/lib/config";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Zod gives us length + shape guards before we ever touch bcrypt.
const loginSchema = z.object({
  email: z.string().trim().min(3).max(254).email(),
  password: z.string().min(1).max(1024),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof CsrfError) {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    throw error;
  }

  // 10 attempts per IP per 15 minutes. Low-friction for real users, kills
  // credential-stuffing bots on shared infra.
  const ip = getClientIp(request);
  const ipLimit = await rateLimit(`login:ip:${ip}`, { max: 10, windowMs: 15 * 60_000 });
  if (!ipLimit.allowed) {
    return NextResponse.redirect(
      new URL("/?error=rate_limited", request.url),
      { status: 303 },
    );
  }

  const formData = await request.formData();
  const parsed = loginSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });

  if (!parsed.success) {
    return NextResponse.redirect(
      new URL("/?error=invalid_credentials", request.url),
      { status: 303 },
    );
  }

  // Per-email limit defends individual accounts from targeted brute force.
  const emailKey = parsed.data.email.trim().toLowerCase();
  const emailLimit = await rateLimit(`login:email:${emailKey}`, {
    max: 5,
    windowMs: 15 * 60_000,
  });
  if (!emailLimit.allowed) {
    return NextResponse.redirect(
      new URL("/?error=rate_limited", request.url),
      { status: 303 },
    );
  }

  if (!hasUsers() || !hasSessionSecret()) {
    return NextResponse.redirect(
      new URL("/?error=missing_config", request.url),
      { status: 303 },
    );
  }

  const validatedEmail = await validateCredentials(
    parsed.data.email,
    parsed.data.password,
  );

  if (!validatedEmail) {
    console.warn(
      `[auth] login failed email=${emailKey} ip=${ip} remaining=${emailLimit.remaining}`,
    );
    return NextResponse.redirect(
      new URL("/?error=invalid_credentials", request.url),
      { status: 303 },
    );
  }

  console.info(`[auth] login success email=${validatedEmail} ip=${ip}`);
  // Make sure the DB row exists so revocation state has somewhere to live,
  // but don't fail the login if the DB is temporarily unavailable — the
  // session is still cryptographically valid.
  await ensureUserRecord(validatedEmail).catch((error) => {
    console.error("[auth] ensureUserRecord failed during login", error);
  });
  const token = await createSessionToken(validatedEmail);
  const response = NextResponse.redirect(
    new URL("/workspace", request.url),
    { status: 303 },
  );

  response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

  return response;
}
