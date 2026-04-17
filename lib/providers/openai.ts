import { getOpenAITranscriptionModel } from "@/lib/config";
import { getOpenAIClient } from "@/lib/openai";
import {
  getFileTranscriptionSource,
  type TranscriptionProvider,
} from "@/lib/providers/types";

export const openAiTranscriptionProvider: TranscriptionProvider = {
  id: "openai",
  name: "OpenAI Whisper",
  mode: "cloud",
  description: "Fast fallback transcription using the existing OpenAI route.",
  async transcribe(source) {
    const file = getFileTranscriptionSource(source, "OpenAI Whisper");
    const openai = getOpenAIClient();
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: getOpenAITranscriptionModel(),
      language: "en",
    });

    return {
      text: typeof transcription === "string" ? transcription : transcription.text,
      raw: transcription,
    };
  },
};
