import { NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
} from "@/lib/auth";
import { hasSessionSecret, hasUsers, validateCredentials } from "@/lib/config";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!hasUsers() || !hasSessionSecret()) {
    return NextResponse.redirect(
      new URL("/?error=missing_config", request.url),
      { status: 303 },
    );
  }

  const validatedEmail = await validateCredentials(email, password);

  if (!validatedEmail) {
    return NextResponse.redirect(
      new URL("/?error=invalid_credentials", request.url),
      { status: 303 },
    );
  }

  const token = await createSessionToken(validatedEmail);
  const response = NextResponse.redirect(
    new URL("/workspace", request.url),
    { status: 303 },
  );

  response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

  return response;
}
