import { FatalError } from "workflow";

import type { ClinicSummary } from "@/lib/summary-schema";

type StoredGeminiJob = {
  fileName: string;
  focus: string;
  id: string;
  matterType: string;
  sourceAudioPath: string;
  sourceAudioSize: number;
  sourceAudioType: string;
  sourceAudioUrl: string;
  status: string;
};

type GeminiUploadedAudio = {
  estimatedDurationSeconds: number;
  mimeType: string;
  name: string;
  totalTokens: number;
  uri: string;
};

const GEMINI_TRANSCRIPTION_WINDOW_SECONDS = 10 * 60;
const GEMINI_SINGLE_SHOT_THRESHOLD_SECONDS = 4 * 60 * 60;

function buildGeminiTranscriptionWindows(estimatedDurationSeconds: number) {
  const safeDurationSeconds = Math.max(1, Math.ceil(estimatedDurationSeconds));
  const windows: Array<{
    endSec: number;
    startSec: number;
  }> = [];

  for (
    let startSec = 0;
    startSec < safeDurationSeconds;
    startSec += GEMINI_TRANSCRIPTION_WINDOW_SECONDS
  ) {
    windows.push({
      startSec,
      endSec: Math.min(
        startSec + GEMINI_TRANSCRIPTION_WINDOW_SECONDS - 1,
        safeDurationSeconds - 1,
      ),
    });
  }

  return windows;
}

async function loadStoredGeminiJob(jobId: string): Promise<StoredGeminiJob> {
  "use step";

  const { loadStoredJob } = await import("@/lib/job-store");
  const job = await loadStoredJob(jobId);

  if (!job) {
    throw new FatalError("Job not found.");
  }

  if (job.provider !== "gemini") {
    throw new FatalError("This workflow only supports Gemini jobs.");
  }

  if (
    !job.sourceAudioUrl ||
    !job.sourceAudioPath ||
    !job.sourceAudioType ||
    !job.sourceAudioSize
  ) {
    throw new FatalError("Gemini background jobs require stored audio metadata.");
  }

  return {
    id: job.id,
    fileName: job.fileName,
    matterType: job.matterType,
    focus: job.focus ?? "",
    sourceAudioUrl: job.sourceAudioUrl,
    sourceAudioPath: job.sourceAudioPath,
    sourceAudioType: job.sourceAudioType,
    sourceAudioSize: job.sourceAudioSize,
    status: job.status,
  };
}

async function updateJobStatus(
  jobId: string,
  status: "transcribing" | "summarizing",
  transcript?: string,
) {
  "use step";

  const { updateStoredJob } = await import("@/lib/job-store");
  await updateStoredJob(jobId, {
    status,
    errorMessage: null,
    ...(transcript ? { transcript } : {}),
  });
}

async function markJobDone(
  jobId: string,
  transcript: string,
  summary: ClinicSummary,
) {
  "use step";

  const { updateStoredJob } = await import("@/lib/job-store");
  await updateStoredJob(jobId, {
    status: "done",
    transcript,
    summary,
    errorMessage: null,
  });
}

async function markJobFailed(jobId: string, errorMessage: string) {
  "use step";

  const { updateStoredJob } = await import("@/lib/job-store");
  await updateStoredJob(jobId, {
    status: "failed",
    errorMessage,
  });
}

async function prepareGeminiAudio(job: StoredGeminiJob): Promise<GeminiUploadedAudio> {
  "use step";

  const { readStoredAudioForTranscription } = await import("@/lib/blob-storage");
  const { uploadGeminiAudio } = await import("@/lib/providers/gemini");
  const { transcriptionSource, cleanup } = await readStoredAudioForTranscription({
    url: job.sourceAudioUrl,
    pathname: job.sourceAudioPath,
    fileName: job.fileName,
    contentType: job.sourceAudioType,
    size: job.sourceAudioSize,
  });

  try {
    return await uploadGeminiAudio(transcriptionSource);
  } finally {
    await cleanup().catch(() => null);
  }
}

async function transcribeWindow(
  uploadedAudio: GeminiUploadedAudio,
  fileName: string,
  startSec: number,
  endSec: number,
) {
  "use step";

  const { transcribeGeminiAudioWindow } = await import("@/lib/providers/gemini");
  return transcribeGeminiAudioWindow(uploadedAudio, {
    fileName,
    startSec,
    endSec,
  });
}

async function transcribeSingleShot(
  uploadedAudio: GeminiUploadedAudio,
  fileName: string,
) {
  "use step";

  const { transcribeGeminiAudioSingleShot } = await import("@/lib/providers/gemini");
  return transcribeGeminiAudioSingleShot(uploadedAudio, fileName);
}

async function summarizeJob(
  transcript: string,
  matterType: string,
  focus: string,
) {
  "use step";

  const { summarizeTranscript } = await import("@/lib/summarize");
  return summarizeTranscript({
    transcript,
    matterType,
    focus,
    segments: [],
  });
}

async function cleanupGeminiAudio(name: string) {
  "use step";

  const { deleteGeminiAudioUpload } = await import("@/lib/providers/gemini");
  await deleteGeminiAudioUpload(name);
}

export async function processGeminiBlobJob(jobId: string) {
  "use workflow";

  let uploadedAudioName: string | null = null;

  try {
    const job = await loadStoredGeminiJob(jobId);

    if (job.status === "done") {
      return;
    }

    if (job.status === "failed") {
      throw new FatalError("Job is already marked as failed.");
    }

    await updateJobStatus(job.id, "transcribing");

    const uploadedAudio = await prepareGeminiAudio(job);
    uploadedAudioName = uploadedAudio.name;

    let transcript: string;

    if (uploadedAudio.estimatedDurationSeconds <= GEMINI_SINGLE_SHOT_THRESHOLD_SECONDS) {
      transcript = (await transcribeSingleShot(uploadedAudio, job.fileName) || "").trim();
    } else {
      const transcriptWindows = buildGeminiTranscriptionWindows(
        uploadedAudio.estimatedDurationSeconds,
      );
      const transcriptChunks: string[] = [];

      for (const window of transcriptWindows) {
        const chunk = await transcribeWindow(
          uploadedAudio,
          job.fileName,
          window.startSec,
          window.endSec,
        );

        if (chunk) {
          transcriptChunks.push(chunk);
        }
      }

      transcript = transcriptChunks.join("\n\n").trim();
    }

    if (!transcript) {
      throw new Error("Gemini did not return transcription text for this job.");
    }

    await updateJobStatus(job.id, "summarizing", transcript);

    const summary = await summarizeJob(transcript, job.matterType, job.focus);
    await markJobDone(job.id, transcript, summary);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The app could not finish the background transcription workflow.";

    await markJobFailed(jobId, message).catch(() => null);
    throw error;
  } finally {
    if (uploadedAudioName) {
      await cleanupGeminiAudio(uploadedAudioName).catch(() => null);
    }
  }
}
