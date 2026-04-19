import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  parseDirectUploadClientPayload,
  isAudioUploadPath,
} from "@/lib/audio-upload";
import {
  ACCEPTED_AUDIO_TYPES,
  hasBlobStoreConfig,
} from "@/lib/config";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { getProvider, getProviderUploadMaxBytes } from "@/lib/providers";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

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

  if (!hasBlobStoreConfig()) {
    return NextResponse.json(
      { error: "Blob-backed uploads are not configured on this deployment." },
      { status: 503 },
    );
  }

  // Cap upload-token requests per IP. Without this, an attacker with a
  // hijacked session could mint thousands of signed blob URLs.
  const limit = await rateLimit(`uploads:${getClientIp(request)}`, {
    max: 60,
    windowMs: 10 * 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many upload requests. Please wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.resetSeconds) } },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const userEmail = await getCurrentUser();

        if (!userEmail) {
          throw new Error("Unauthorized.");
        }

        if (!isAudioUploadPath(pathname)) {
          throw new Error("Upload path is invalid.");
        }

        const { providerId } = parseDirectUploadClientPayload(clientPayload);
        const provider = getProvider(providerId);

        if (!provider.supportsBlobUpload) {
          throw new Error(
            "Selected transcription provider does not support direct audio uploads yet.",
          );
        }

        return {
          addRandomSuffix: false,
          allowedContentTypes: ACCEPTED_AUDIO_TYPES,
          maximumSizeInBytes: getProviderUploadMaxBytes(provider, "blob"),
          tokenPayload: JSON.stringify({
            providerId,
            userEmail,
          }),
          validUntil: Date.now() + 5 * 60 * 1000,
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    // Log the underlying cause but keep the response generic in production.
    console.error("[uploads] handleUpload failed", error);
    const publicMessage =
      error instanceof Error && error.message === "Unauthorized."
        ? "Unauthorized."
        : "The upload request could not be completed.";
    return NextResponse.json({ error: publicMessage }, { status: 400 });
  }
}
