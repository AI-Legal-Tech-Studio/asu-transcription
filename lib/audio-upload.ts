const AUDIO_UPLOAD_PATH_PREFIX = "clinic-audio";

function cleanSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export type StoredAudioPayload = {
  url: string;
  pathname: string;
  fileName: string;
  contentType: string;
  size: number;
};

type DirectUploadClientPayload = {
  providerId: string;
};

export function buildAudioUploadPath(fileName: string, now = new Date()) {
  const dateSegment = now.toISOString().slice(0, 10);
  const cleanedFileName = cleanSegment(fileName) || "audio-upload";

  return `${AUDIO_UPLOAD_PATH_PREFIX}/${dateSegment}/${crypto.randomUUID()}-${cleanedFileName}`;
}

export function isAudioUploadPath(pathname: string) {
  return pathname.startsWith(`${AUDIO_UPLOAD_PATH_PREFIX}/`);
}

export function parseDirectUploadClientPayload(
  value: string | null | undefined,
): DirectUploadClientPayload {
  const payload = value ? JSON.parse(value) : null;

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.providerId !== "string" ||
    !payload.providerId.trim()
  ) {
    throw new Error("Upload request is missing a valid provider selection.");
  }

  return {
    providerId: payload.providerId.trim(),
  };
}

export function parseStoredAudioPayload(formData: FormData): StoredAudioPayload | null {
  const url = String(formData.get("audioBlobUrl") ?? "").trim();

  if (!url) {
    return null;
  }

  const pathname = String(formData.get("audioBlobPathname") ?? "").trim();
  const fileName = String(formData.get("audioFileName") ?? "").trim();
  const contentType = String(formData.get("audioContentType") ?? "").trim();
  const size = Number.parseInt(String(formData.get("audioSizeBytes") ?? ""), 10);

  if (!pathname || !fileName || !contentType || !Number.isFinite(size) || size <= 0) {
    throw new Error("Stored audio reference is incomplete.");
  }

  if (!isAudioUploadPath(pathname)) {
    throw new Error("Stored audio reference is invalid.");
  }

  return {
    url,
    pathname,
    fileName,
    contentType,
    size,
  };
}
