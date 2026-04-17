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
import { getProvider, getProviderUploadMaxBytes } from "@/lib/providers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasBlobStoreConfig()) {
    return NextResponse.json(
      { error: "Blob-backed uploads are not configured on this deployment." },
      { status: 503 },
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
