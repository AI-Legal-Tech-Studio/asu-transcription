import { readFile } from "node:fs/promises";

import { getVoxtralTranscriptionModel } from "@/lib/config";
import {
  extractOpenRouterText,
  getOpenRouterHeaders,
  parseOpenRouterResponse,
} from "@/lib/openrouter";
import {
  getTranscriptionSourceMimeType,
  getTranscriptionSourceName,
  inferAudioFormat,
  type TranscriptionProvider,
  type TranscriptionSource,
} from "@/lib/providers/types";

const VOXTRAL_BLOB_MAX_BYTES = 24 * 1024 * 1024;

function getPrompt(fileName: string) {
  return [
    "Transcribe this audio recording for a law clinic workflow.",
    "Return only the transcript text with no JSON, code fences, or extra commentary.",
    "When speaker changes are clear, prefix paragraphs with labels like Speaker 1: and Speaker 2:.",
    `File name: ${fileName}`,
  ].join(" ");
}

function cleanTranscript(content: string) {
  return content
    .replace(/^```(?:text|json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

async function readSourceAsBase64(source: TranscriptionSource) {
  if (source.kind === "path") {
    return (await readFile(source.filePath)).toString("base64");
  }

  return Buffer.from(await source.file.arrayBuffer()).toString("base64");
}

export const voxtralOpenRouterProvider: TranscriptionProvider = {
  id: "voxtral-openrouter",
  name: "Voxtral via OpenRouter",
  mode: "cloud",
  description: "Experimental Mistral Voxtral transcription through OpenRouter audio chat completions.",
  supportsBlobUpload: true,
  maxUploadBytes: {
    blob: VOXTRAL_BLOB_MAX_BYTES,
  },
  async transcribe(source) {
    const fileName = getTranscriptionSourceName(source);
    const mimeType = getTranscriptionSourceMimeType(source) || "audio/mpeg";
    const payload = {
      model: getVoxtralTranscriptionModel(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: getPrompt(fileName),
            },
            {
              type: "input_audio",
              input_audio: {
                data: await readSourceAsBase64(source),
                format: inferAudioFormat(mimeType, fileName),
              },
            },
          ],
        },
      ],
      max_tokens: 20000,
      temperature: 0,
    };

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: getOpenRouterHeaders(),
        body: JSON.stringify(payload),
      },
    );
    const parsed = await parseOpenRouterResponse(response);
    const content = cleanTranscript(extractOpenRouterText(parsed));

    if (!content) {
      throw new Error("Voxtral returned no transcript text.");
    }

    return {
      text: content,
      raw: parsed,
    };
  },
};
