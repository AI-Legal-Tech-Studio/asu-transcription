import { getWhisperApiUrl } from "@/lib/config";
import {
  getFileTranscriptionSource,
  normalizeTranscriptionResult,
  type TranscriptionProvider,
} from "@/lib/providers/types";

export const whisperLocalProvider: TranscriptionProvider = {
  id: "whisper-local",
  name: "Local Whisper",
  mode: "local",
  description: "Sends the file to a local faster-whisper compatible HTTP endpoint.",
  async transcribe(source) {
    const file = getFileTranscriptionSource(source, "Local Whisper");
    const apiUrl = getWhisperApiUrl();

    if (!apiUrl) {
      throw new Error("WHISPER_API_URL is not configured for local transcription.");
    }

    const formData = new FormData();
    formData.set("audio", file);

    const response = await fetch(apiUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Local whisper transcription request failed.");
    }

    const payload = (await response.json()) as unknown;
    return normalizeTranscriptionResult(payload, payload);
  },
};
