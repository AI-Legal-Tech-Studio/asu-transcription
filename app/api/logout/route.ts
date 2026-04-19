import { NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  getCurrentUser,
  getSessionCookieOptions,
  revokeUserSessions,
} from "@/lib/auth";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof CsrfError) {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    throw error;
  }

  // Revoke every outstanding JWT for this user, not just the cookie on this
  // device. If the user is clicking "sign out" it's because they want all
  // their sessions gone — for example after suspecting token theft.
  const email = await getCurrentUser();
  if (email) {
    await revokeUserSessions(email).catch((error) => {
      console.error("[auth] revokeUserSessions failed during logout", error);
    });
    console.info(`[auth] logout email=${email}`);
  }

  const response = NextResponse.redirect(new URL("/", request.url), {
    status: 303,
  });

  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...getSessionCookieOptions(),
    maxAge: 0,
  });

  return response;
}
