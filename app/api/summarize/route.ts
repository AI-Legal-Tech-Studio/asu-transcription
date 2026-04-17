import type { Job } from "@prisma/client";
import { NextResponse } from "next/server";
import { start } from "workflow/api";

import { getCurrentUser } from "@/lib/auth";
import {
  parseStoredAudioPayload,
  type StoredAudioPayload,
} from "@/lib/audio-upload";
import { readStoredAudioForTranscription } from "@/lib/blob-storage";
import {
  ACCEPTED_AUDIO_TYPES,
  hasDatabaseConfig,
  hasBlobStoreConfig,
  hasSummaryConfig,
} from "@/lib/config";
import { createPendingStoredJob, updateStoredJob } from "@/lib/job-store";
import { serializeJobDetail } from "@/lib/jobs";
import {
  getDefaultProviderId,
  getProvider,
  getProviderUploadMaxBytes,
} from "@/lib/providers";
import {
  createFileTranscriptionSource,
  getTranscriptionSourceMimeType,
  getTranscriptionSourceName,
  type SpeakerSegment,
  type TranscriptionSource,
} from "@/lib/providers/types";
import { summarizeTranscript } from "@/lib/summarize";
import {
  formatBytesLabel,
  getUploadSizeLimitMessage,
  isUploadTooLargeText,
} from "@/lib/upload-limits";
import { processGeminiBlobJob } from "@/workflows/process-gemini-blob-job";

export const runtime = "nodejs";
export const maxDuration = 300;

async function cleanupSource(cleanup: (() => Promise<void>) | null) {
  if (!cleanup) {
    return;
  }

  await cleanup().catch(() => null);
}

export async function POST(request: Request) {
  const userEmail = await getCurrentUser();

  if (!userEmail) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasDatabaseConfig()) {
    return NextResponse.json(
      { error: "Database persistence is not configured on this deployment." },
      { status: 503 },
    );
  }

  if (!hasSummaryConfig()) {
    return NextResponse.json(
      { error: "OpenRouter summarization is not configured on this deployment." },
      { status: 503 },
    );
  }

  const defaultProviderId = getDefaultProviderId();

  if (!defaultProviderId) {
    return NextResponse.json(
      { error: "No transcription providers are configured on this deployment." },
      { status: 503 },
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The upload request could not be read.";

    return NextResponse.json(
      {
        error: isUploadTooLargeText(message)
          ? getUploadSizeLimitMessage()
          : message,
      },
      { status: isUploadTooLargeText(message) ? 413 : 400 },
    );
  }

  const file = formData.get("audio");
  const matterType = String(formData.get("matterType") ?? "General intake").trim();
  const focus = String(formData.get("focus") ?? "").trim();
  const providerId = String(formData.get("provider") ?? defaultProviderId).trim();
  let storedAudio: StoredAudioPayload | null = null;

  try {
    storedAudio = parseStoredAudioPayload(formData);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stored audio reference is invalid.";

    return NextResponse.json({ error: message }, { status: 400 });
  }

  const provider = getProvider(providerId);
  const isGeminiBackgroundJob = provider.id === "gemini" && Boolean(storedAudio);
  const requestUploadMaxBytes = getProviderUploadMaxBytes(provider, "request");
  const blobUploadMaxBytes = getProviderUploadMaxBytes(provider, "blob");
  let sourceAudio = storedAudio
    ? {
        url: storedAudio.url,
        path: storedAudio.pathname,
        type: storedAudio.contentType,
        size: storedAudio.size,
      }
    : null;
  let transcriptionSource: TranscriptionSource;
  let cleanupTranscriptionSource: (() => Promise<void>) | null = null;

  if (storedAudio) {
    if (!provider.supportsBlobUpload) {
      return NextResponse.json(
        {
          error:
            "Selected transcription provider does not support direct stored-audio uploads yet.",
        },
        { status: 400 },
      );
    }

    if (!hasBlobStoreConfig()) {
      return NextResponse.json(
        { error: "Blob-backed uploads are not configured on this deployment." },
        { status: 503 },
      );
    }

    if (storedAudio.size > blobUploadMaxBytes) {
      return NextResponse.json(
        {
          error: getUploadSizeLimitMessage(
            formatBytesLabel(blobUploadMaxBytes),
            "blob",
          ),
        },
        { status: 413 },
      );
    }

    if (
      storedAudio.contentType &&
      !ACCEPTED_AUDIO_TYPES.includes(storedAudio.contentType)
    ) {
      return NextResponse.json(
        {
          error:
            "Unsupported audio type. Try mp3, mp4, m4a, wav, webm, or another standard browser audio format.",
        },
        { status: 400 },
      );
    }

    if (isGeminiBackgroundJob) {
      try {
        const job = await createPendingStoredJob({
          userEmail,
          fileName: storedAudio.fileName,
          matterType,
          focus,
          providerId: provider.id,
          sourceAudio,
        });

        try {
          await start(processGeminiBlobJob, [job.id]);
        } catch (startError) {
          const message =
            startError instanceof Error
              ? startError.message
              : "The background Gemini workflow could not be started.";

          await updateStoredJob(job.id, {
            status: "failed",
            errorMessage: message,
          }).catch(() => null);

          return NextResponse.json(
            { error: message, jobId: job.id },
            { status: 500 },
          );
        }

        return NextResponse.json({
          job: serializeJobDetail(job),
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The app could not queue the background Gemini workflow.";

        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    try {
      const { transcriptionSource: blobSource, blob, cleanup } =
        await readStoredAudioForTranscription(storedAudio);
      transcriptionSource = blobSource;
      cleanupTranscriptionSource = cleanup;
      sourceAudio = {
        url: blob.url,
        path: blob.pathname,
        type: blob.contentType,
        size: blob.size,
      };

      if (blob.size > blobUploadMaxBytes) {
        await cleanupSource(cleanupTranscriptionSource);
        cleanupTranscriptionSource = null;
        return NextResponse.json(
          {
            error: getUploadSizeLimitMessage(
              formatBytesLabel(blobUploadMaxBytes),
              "blob",
            ),
          },
          { status: 413 },
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Uploaded audio could not be retrieved from storage.";

      return NextResponse.json({ error: message }, { status: 400 });
    }
  } else if (file instanceof File) {
    transcriptionSource = createFileTranscriptionSource(file);

    if (file.size > requestUploadMaxBytes) {
      return NextResponse.json(
        {
          error: getUploadSizeLimitMessage(
            formatBytesLabel(requestUploadMaxBytes),
          ),
        },
        { status: 413 },
      );
    }
  } else {
    return NextResponse.json(
      { error: "Please attach an audio file before submitting." },
      { status: 400 },
    );
  }

  const transcriptionMimeType = getTranscriptionSourceMimeType(transcriptionSource);

  if (transcriptionMimeType && !ACCEPTED_AUDIO_TYPES.includes(transcriptionMimeType)) {
    await cleanupSource(cleanupTranscriptionSource);
    cleanupTranscriptionSource = null;
    return NextResponse.json(
      {
        error:
          "Unsupported audio type. Try mp3, mp4, m4a, wav, webm, or another standard browser audio format.",
      },
      { status: 400 },
    );
  }

  let transcript: string | null = null;
  let speakerSegments: SpeakerSegment[] = [];
  let job: Job | null = null;

  try {
    job = await createPendingStoredJob({
      userEmail,
      fileName: getTranscriptionSourceName(transcriptionSource),
      matterType,
      focus,
      providerId: provider.id,
      sourceAudio,
    });

    job = await updateStoredJob(job.id, {
      status: "transcribing",
      errorMessage: null,
    });

    const transcription = await provider.transcribe(transcriptionSource);
    transcript = transcription.text;
    speakerSegments = transcription.segments ?? [];

    job = await updateStoredJob(job.id, {
      status: "summarizing",
      transcript,
      ...(speakerSegments.length ? { speakerSegments } : {}),
    });

    const summary = await summarizeTranscript({
      transcript,
      matterType,
      focus,
      segments: speakerSegments,
    });

    job = await updateStoredJob(job.id, {
      status: "done",
      summary,
      errorMessage: null,
      ...(speakerSegments.length ? { speakerSegments } : {}),
    });

    return NextResponse.json({
      job: serializeJobDetail(job),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The app could not finish the transcript and summary workflow.";

    if (job) {
      await updateStoredJob(job.id, {
        status: "failed",
        errorMessage: message,
        ...(transcript ? { transcript } : {}),
        ...(speakerSegments.length ? { speakerSegments } : {}),
      }).catch(() => null);
    }

    return NextResponse.json(
      { error: message, ...(job ? { jobId: job.id } : {}) },
      { status: 500 },
    );
  } finally {
    await cleanupSource(cleanupTranscriptionSource);
  }
}
