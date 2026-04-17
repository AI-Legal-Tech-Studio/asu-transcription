import { z } from "zod";

export const speakerSegmentSchema = z.object({
  startSec: z.number().nullable().optional(),
  endSec: z.number().nullable().optional(),
  speaker: z.string().trim().optional(),
  text: z.string().trim(),
});

export const speakerSegmentsSchema = z.array(speakerSegmentSchema);

export const transcriptionResultSchema = z.object({
  text: z.string().trim().optional().default(""),
  segments: speakerSegmentsSchema.optional(),
  language: z.string().trim().optional(),
});

export type SpeakerSegment = z.infer<typeof speakerSegmentSchema>;
export type ProviderMode = "cloud" | "local";
export type UploadMode = "request" | "blob";
export type FileTranscriptionSource = {
  kind: "file";
  file: File;
  cleanup?: () => Promise<void>;
};
export type PathTranscriptionSource = {
  kind: "path";
  filePath: string;
  name: string;
  mimeType: string;
  size: number;
  cleanup?: () => Promise<void>;
};
export type TranscriptionSource = FileTranscriptionSource | PathTranscriptionSource;
export type ProviderUploadSupport = {
  mode: UploadMode;
  maxBytes: number;
  maxSizeLabel: string;
};
export type ProviderOption = {
  id: string;
  name: string;
  mode: ProviderMode;
  description: string;
  upload: ProviderUploadSupport;
  isDefault?: boolean;
};

export type TranscriptionResult = z.infer<typeof transcriptionResultSchema> & {
  raw?: unknown;
};

export interface TranscriptionProvider
  extends Omit<ProviderOption, "isDefault" | "upload"> {
  supportsBlobUpload?: boolean;
  maxUploadBytes?: Partial<Record<UploadMode, number>>;
  transcribe(source: TranscriptionSource): Promise<TranscriptionResult>;
}

export function createFileTranscriptionSource(file: File): FileTranscriptionSource {
  return {
    kind: "file",
    file,
  };
}

export function getTranscriptionSourceName(source: TranscriptionSource) {
  return source.kind === "file" ? source.file.name : source.name;
}

export function getTranscriptionSourceMimeType(source: TranscriptionSource) {
  return source.kind === "file" ? source.file.type : source.mimeType;
}

export function getTranscriptionSourceSize(source: TranscriptionSource) {
  return source.kind === "file" ? source.file.size : source.size;
}

export function getFileTranscriptionSource(
  source: TranscriptionSource,
  providerName: string,
) {
  if (source.kind !== "file") {
    throw new Error(
      `${providerName} currently requires smaller request-body uploads on this deployment.`,
    );
  }

  return source.file;
}

function formatTranscriptFromSegments(segments: SpeakerSegment[]) {
  return segments
    .map((segment) => {
      const speaker = segment.speaker?.trim() || "Speaker";
      return `${speaker}: ${segment.text}`;
    })
    .join("\n\n")
    .trim();
}

export function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }

    const firstBracket = trimmed.indexOf("[");
    const lastBracket = trimmed.lastIndexOf("]");

    if (firstBracket >= 0 && lastBracket > firstBracket) {
      return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1));
    }

    throw new Error("Model response did not contain valid JSON.");
  }
}

export function normalizeTranscriptionResult(
  value: unknown,
  raw?: unknown,
): TranscriptionResult {
  const parsed = transcriptionResultSchema.parse(value);
  const fallbackText = parsed.segments?.length
    ? formatTranscriptFromSegments(parsed.segments)
    : "";
  const text = parsed.text || fallbackText;

  if (!text) {
    throw new Error("Transcription provider returned no text.");
  }

  return {
    ...parsed,
    text,
    raw,
  };
}

export function inferAudioFormat(mimeType: string, fileName: string) {
  const cleanedMimeType = mimeType.toLowerCase();
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (cleanedMimeType.includes("mpeg") || extension === "mp3") {
    return "mp3";
  }

  if (cleanedMimeType.includes("wav") || extension === "wav") {
    return "wav";
  }

  if (cleanedMimeType.includes("ogg") || extension === "ogg") {
    return "ogg";
  }

  if (cleanedMimeType.includes("webm") || extension === "webm") {
    return "webm";
  }

  if (cleanedMimeType.includes("mp4") || extension === "mp4" || extension === "m4a") {
    return "mp4";
  }

  return "wav";
}
