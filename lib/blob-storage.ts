import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { del, get } from "@vercel/blob";

import { hasBlobStoreConfig } from "@/lib/config";
import { type StoredAudioPayload } from "@/lib/audio-upload";
import { type PathTranscriptionSource } from "@/lib/providers/types";

function getSafeTempFileName(fileName: string) {
  const cleanedFileName = basename(fileName)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleanedFileName || "audio-upload";
}

export async function readStoredAudioForTranscription(audio: StoredAudioPayload) {
  if (!hasBlobStoreConfig()) {
    throw new Error("Blob-backed uploads are not configured on this deployment.");
  }

  const blobResult = await get(audio.url, {
    access: "private",
  });

  if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
    throw new Error("Uploaded audio could not be retrieved from storage.");
  }

  const tempDirectory = await mkdtemp(join(tmpdir(), "voice-transcription-"));
  const tempFilePath = join(tempDirectory, getSafeTempFileName(audio.fileName));
  const inputStream = Readable.fromWeb(
    blobResult.stream as unknown as NodeReadableStream,
  );

  try {
    await pipeline(inputStream, createWriteStream(tempFilePath));
  } catch (error) {
    await rm(tempDirectory, { recursive: true, force: true }).catch(() => null);
    throw error;
  }

  const transcriptionSource: PathTranscriptionSource = {
    kind: "path",
    filePath: tempFilePath,
    name: audio.fileName,
    mimeType: blobResult.blob.contentType || audio.contentType,
    size: blobResult.blob.size || audio.size,
  };

  return {
    transcriptionSource,
    blob: blobResult.blob,
    cleanup: async () => {
      await rm(tempDirectory, { recursive: true, force: true }).catch(() => null);
    },
  };
}

export async function deleteStoredAudio(urlOrPathname: string | null | undefined) {
  if (!urlOrPathname || !hasBlobStoreConfig()) {
    return;
  }

  await del(urlOrPathname).catch(() => null);
}
