import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, getSessionCookieOptions } from "@/lib/auth";
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

  const response = NextResponse.redirect(new URL("/", request.url), {
    status: 303,
  });

  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...getSessionCookieOptions(),
    maxAge: 0,
  });

  return response;
}
