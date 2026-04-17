export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_AUDIO_SIZE_LABEL = "4 MB";
const ONE_MEGABYTE = 1024 * 1024;

function normalizeErrorText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

export function formatBytesLabel(bytes: number) {
  if (bytes >= ONE_MEGABYTE && bytes % ONE_MEGABYTE === 0) {
    return `${bytes / ONE_MEGABYTE} MB`;
  }

  return `${(bytes / ONE_MEGABYTE).toFixed(1)} MB`;
}

export function getUploadSizeLimitMessage(
  limitLabel = MAX_AUDIO_SIZE_LABEL,
  mode: "request" | "blob" = "request",
) {
  if (mode === "blob") {
    return `This provider currently accepts audio files up to ${limitLabel} on the direct-upload path. Longer recordings may still need provider-specific tuning or background processing.`;
  }

  return `This deployment currently accepts audio files up to ${limitLabel} because uploads still pass through a Vercel Function. Trim or compress the recording before uploading.`;
}

export function isUploadTooLargeText(value: string | null | undefined) {
  const normalized = normalizeErrorText(value);

  return (
    normalized.includes("request entity too large") ||
    normalized.includes("function_payload_too_large") ||
    normalized.includes("payload too large") ||
    normalized.includes("body exceeded")
  );
}

export function isUploadTooLargeSignal(
  status: number,
  rawText?: string | null,
) {
  return status === 413 || isUploadTooLargeText(rawText);
}
