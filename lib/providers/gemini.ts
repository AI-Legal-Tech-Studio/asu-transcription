import { readFile } from "node:fs/promises";

import {
  createPartFromUri,
  createUserContent,
  GoogleGenAI,
  Type,
} from "@google/genai";

import {
  GEMINI_INLINE_UPLOAD_LIMIT_BYTES,
  getGeminiTranscriptionModel,
} from "@/lib/config";
import {
  extractJsonValue,
  getTranscriptionSourceMimeType,
  getTranscriptionSourceName,
  getTranscriptionSourceSize,
  normalizeTranscriptionResult,
  type TranscriptionProvider,
  type TranscriptionSource,
} from "@/lib/providers/types";

const GEMINI_AUDIO_TOKENS_PER_SECOND = 32;

export type GeminiUploadedAudio = {
  estimatedDurationSeconds: number;
  mimeType: string;
  name: string;
  totalTokens: number;
  uri: string;
};

function getGeminiClient() {
  const apiKey = process.env.GOOGLE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is missing.");
  }

  return new GoogleGenAI({ apiKey });
}

const geminiResponseSchema = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING },
    language: { type: Type.STRING },
    segments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          startSec: { type: Type.NUMBER, nullable: true },
          endSec: { type: Type.NUMBER, nullable: true },
          speaker: { type: Type.STRING },
          text: { type: Type.STRING },
        },
        required: ["text"],
      },
    },
  },
  required: ["text"],
};

function getPrompt(fileName: string) {
  return [
    "Transcribe this legal audio recording as accurately as possible.",
    "Return JSON only.",
    "Use speaker labels like Speaker 1 and Speaker 2 when you can distinguish voices.",
    "If speaker changes are unclear, still return the best plain transcript you can.",
    "Prefer numeric seconds for startSec and endSec when timestamps are available.",
    `File name: ${fileName}`,
  ].join(" ");
}

async function readInlineBytes(source: TranscriptionSource) {
  if (source.kind === "path") {
    return readFile(source.filePath);
  }

  return Buffer.from(await source.file.arrayBuffer());
}

function normalizeGeminiResponseText(value: string | undefined) {
  return value?.trim() ?? "";
}

function normalizeGeminiTranscriptionResponse(response: { text?: string }) {
  const responseText = normalizeGeminiResponseText(response.text);

  if (!responseText) {
    throw new Error("Gemini did not return transcription text.");
  }

  try {
    return normalizeTranscriptionResult(extractJsonValue(responseText), response);
  } catch (error) {
    if (responseText.length < 40) {
      throw error;
    }

    return normalizeTranscriptionResult({ text: responseText }, response);
  }
}

function formatGeminiTimestamp(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildWindowTranscriptPrompt(
  fileName: string,
  startSec: number,
  endSec: number,
) {
  return [
    "Transcribe this legal audio recording as accurately as possible.",
    `Only transcribe speech between ${formatGeminiTimestamp(startSec)} and ${formatGeminiTimestamp(endSec)}.`,
    "Return plain text only with no headings or commentary.",
    "Use labels like Speaker 1 and Speaker 2 when you can distinguish voices.",
    "Insert paragraph breaks (blank lines) between natural topic changes, speaker turns, or when the speaker pauses for a new thought.",
    "Do not summarize or explain the audio.",
    `File name: ${fileName}`,
  ].join(" ");
}

function normalizeGeminiWindowText(value: string | undefined) {
  return value?.replace(/\r\n/g, "\n").trim() ?? "";
}

export async function uploadGeminiAudio(
  source: TranscriptionSource,
): Promise<GeminiUploadedAudio> {
  const ai = getGeminiClient();
  const fileName = getTranscriptionSourceName(source);
  const mimeType = getTranscriptionSourceMimeType(source) || "audio/mpeg";
  const uploadedFile = await ai.files.upload({
    file: source.kind === "path" ? source.filePath : source.file,
    config: {
      displayName: fileName,
      mimeType,
    },
  });

  if (!uploadedFile.name || !uploadedFile.uri) {
    if (uploadedFile.name) {
      await ai.files.delete({ name: uploadedFile.name }).catch(() => null);
    }

    throw new Error("Gemini file upload did not return a usable file reference.");
  }

  try {
    const tokenCount = await ai.models.countTokens({
      model: getGeminiTranscriptionModel(),
      contents: createUserContent([
        createPartFromUri(uploadedFile.uri, uploadedFile.mimeType ?? mimeType),
      ]),
    });
    const totalTokens = Number(tokenCount.totalTokens ?? 0);

    return {
      name: uploadedFile.name,
      uri: uploadedFile.uri,
      mimeType: uploadedFile.mimeType ?? mimeType,
      totalTokens,
      estimatedDurationSeconds: Math.max(
        1,
        Math.ceil(totalTokens / GEMINI_AUDIO_TOKENS_PER_SECOND),
      ),
    };
  } catch (error) {
    await ai.files.delete({ name: uploadedFile.name }).catch(() => null);
    throw error;
  }
}

export async function deleteGeminiAudioUpload(name: string | null | undefined) {
  if (!name) {
    return;
  }

  const ai = getGeminiClient();
  await ai.files.delete({ name }).catch(() => null);
}

export async function transcribeGeminiAudioSingleShot(
  uploadedAudio: GeminiUploadedAudio,
  fileName: string,
) {
  const ai = getGeminiClient();
  const prompt = [
    "Transcribe this legal audio recording as accurately as possible.",
    "Return plain text only with no headings or commentary.",
    "Use labels like Speaker 1 and Speaker 2 when you can distinguish voices.",
    "Insert paragraph breaks (blank lines) between natural topic changes, speaker turns, or when the speaker pauses for a new thought.",
    "Do not summarize or explain the audio.",
    `File name: ${fileName}`,
  ].join(" ");

  const response = await ai.models.generateContent({
    model: getGeminiTranscriptionModel(),
    contents: createUserContent([
      { text: prompt },
      createPartFromUri(uploadedAudio.uri, uploadedAudio.mimeType),
    ]),
  });

  return normalizeGeminiWindowText(response.text);
}

export async function transcribeGeminiAudioWindow(
  uploadedAudio: GeminiUploadedAudio,
  {
    endSec,
    fileName,
    startSec,
  }: {
    endSec: number;
    fileName: string;
    startSec: number;
  },
) {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: getGeminiTranscriptionModel(),
    contents: createUserContent([
      { text: buildWindowTranscriptPrompt(fileName, startSec, endSec) },
      createPartFromUri(uploadedAudio.uri, uploadedAudio.mimeType),
    ]),
  });

  return normalizeGeminiWindowText(response.text);
}

export const geminiTranscriptionProvider: TranscriptionProvider = {
  id: "gemini",
  name: "Gemini 2.5 Flash",
  mode: "cloud",
  description: "Google Gemini transcription with prompt-based speaker labeling.",
  supportsBlobUpload: true,
  async transcribe(source) {
    const ai = getGeminiClient();
    const fileName = getTranscriptionSourceName(source);
    const mimeType = getTranscriptionSourceMimeType(source) || "audio/mpeg";
    const fileSize = getTranscriptionSourceSize(source);
    const prompt = getPrompt(fileName);
    let uploadedFileName: string | null = null;

    try {
      const shouldUseInlineUpload =
        source.kind === "file" && fileSize <= GEMINI_INLINE_UPLOAD_LIMIT_BYTES;

      const contents = shouldUseInlineUpload
        ? [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: (await readInlineBytes(source)).toString("base64"),
              },
            },
          ]
        : (() => {
            const uploadedFilePromise = ai.files.upload({
              file: source.kind === "path" ? source.filePath : source.file,
              config: {
                displayName: fileName,
                mimeType,
              },
            });

            return uploadedFilePromise.then((uploadedFile) => {
              uploadedFileName = uploadedFile.name ?? null;

              return [
                { text: prompt },
                createPartFromUri(uploadedFile.uri ?? "", uploadedFile.mimeType ?? mimeType),
              ];
            });
          })();

      const response = await ai.models.generateContent({
        model: getGeminiTranscriptionModel(),
        contents: await contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: geminiResponseSchema,
        },
      });

      return normalizeGeminiTranscriptionResponse(response);
    } finally {
      if (uploadedFileName) {
        await ai.files.delete({ name: uploadedFileName }).catch(() => null);
      }
    }
  },
};
