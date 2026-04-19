import { NextResponse } from "next/server";

/**
 * Produce a JSON error response that never leaks server-side internals in
 * production. In development we surface the raw message for debuggability.
 */
export function errorResponse(
  error: unknown,
  {
    status = 500,
    publicMessage = "The request could not be completed.",
    logContext,
  }: {
    status?: number;
    publicMessage?: string;
    logContext?: string;
  } = {},
) {
  const rawMessage = error instanceof Error ? error.message : String(error);

  // Always log for observability.
  console.error(
    `[error]${logContext ? ` ${logContext}:` : ""} ${rawMessage}`,
    error instanceof Error && error.stack ? error.stack : undefined,
  );

  const safeMessage =
    process.env.NODE_ENV === "production" ? publicMessage : rawMessage;

  return NextResponse.json({ error: safeMessage }, { status });
}
