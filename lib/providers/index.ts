import {
  getBlobAudioMaxBytes,
  getDefaultTranscriptionProvider,
  hasBlobStoreConfig,
  hasGoogleConfig,
  hasOpenAIConfig,
  hasOpenRouterConfig,
  hasWhisperConfig,
} from "@/lib/config";
import { geminiTranscriptionProvider } from "@/lib/providers/gemini";
import { openAiTranscriptionProvider } from "@/lib/providers/openai";
import type {
  ProviderOption,
  ProviderUploadSupport,
  TranscriptionProvider,
} from "@/lib/providers/types";
import { voxtralOpenRouterProvider } from "@/lib/providers/voxtral-openrouter";
import { whisperLocalProvider } from "@/lib/providers/whisper-local";
import { formatBytesLabel, MAX_AUDIO_BYTES } from "@/lib/upload-limits";

const providers: Array<{
  enabled: () => boolean;
  provider: TranscriptionProvider;
}> = [
  {
    enabled: hasGoogleConfig,
    provider: geminiTranscriptionProvider,
  },
  {
    enabled: hasOpenRouterConfig,
    provider: voxtralOpenRouterProvider,
  },
  {
    enabled: hasOpenAIConfig,
    provider: openAiTranscriptionProvider,
  },
  {
    enabled: hasWhisperConfig,
    provider: whisperLocalProvider,
  },
];

function getResolvedDefaultProviderId(
  availableProviders: Array<Pick<ProviderOption, "id">>,
) {
  const preferredId = getDefaultTranscriptionProvider();

  if (availableProviders.some((provider) => provider.id === preferredId)) {
    return preferredId;
  }

  return availableProviders[0]?.id ?? null;
}

export function getProviderUploadMaxBytes(
  provider: TranscriptionProvider,
  mode: "request" | "blob",
) {
  const configuredMaxBytes = provider.maxUploadBytes?.[mode];

  if (Number.isFinite(configuredMaxBytes) && configuredMaxBytes && configuredMaxBytes > 0) {
    return configuredMaxBytes;
  }

  return mode === "blob" ? getBlobAudioMaxBytes() : MAX_AUDIO_BYTES;
}

function getUploadSupport(provider: TranscriptionProvider): ProviderUploadSupport {
  if (provider.supportsBlobUpload && hasBlobStoreConfig()) {
    const maxBytes = getProviderUploadMaxBytes(provider, "blob");

    return {
      mode: "blob",
      maxBytes,
      maxSizeLabel: formatBytesLabel(maxBytes),
    };
  }

  const maxBytes = getProviderUploadMaxBytes(provider, "request");

  return {
    mode: "request",
    maxBytes,
    maxSizeLabel: formatBytesLabel(maxBytes),
  };
}

export function getAvailableProviders(): ProviderOption[] {
  const available = providers
    .filter((entry) => entry.enabled())
    .map((entry) => entry.provider);
  const defaultProviderId = getResolvedDefaultProviderId(available);

  return available.map((provider) => ({
    id: provider.id,
    name: provider.name,
    mode: provider.mode,
    description: provider.description,
    upload: getUploadSupport(provider),
    isDefault: provider.id === defaultProviderId,
  }));
}

export function getDefaultProviderId() {
  return getResolvedDefaultProviderId(getAvailableProviders());
}

export function getProvider(id: string) {
  const selectedProvider = providers.find(
    (entry) => entry.provider.id === id && entry.enabled(),
  )?.provider;

  if (!selectedProvider) {
    throw new Error("Selected transcription provider is not available.");
  }

  return selectedProvider;
}
