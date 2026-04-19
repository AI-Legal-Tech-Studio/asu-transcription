export const GEMINI_INLINE_UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024;
const DEFAULT_BLOB_AUDIO_MAX_BYTES = 500 * 1024 * 1024;

export const ACCEPTED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/mpga",
  "audio/mpg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/mp3",
  "video/mp4",
];

function clean(value?: string) {
  return value?.trim() ?? "";
}

interface AppUser {
  email: string;
  passwordHash: string;
}

function getUsers(): AppUser[] {
  const users: AppUser[] = [];
  let index = 1;

  while (true) {
    const email = clean(process.env[`AUTH_USER_${index}_EMAIL`]);
    const passwordHash = clean(process.env[`AUTH_USER_${index}_PASSWORD_HASH`]);

    if (!email || !passwordHash) {
      break;
    }

    users.push({
      email: email.toLowerCase(),
      passwordHash,
    });
    index += 1;
  }

  return users;
}

export function hasUsers() {
  return getUsers().length > 0;
}

// A fixed bcrypt hash of a random unguessable password. Used only to keep the
// unknown-user and wrong-password codepaths indistinguishable in wall-clock
// time, defeating username-enumeration via timing.
const DUMMY_BCRYPT_HASH =
  "$2b$10$7rTROl5ezhnWq1u06vkI0uDH3SqVdHqQbsG7lYkB2yhGmGnnv4P9i";

export async function validateCredentials(
  email: string,
  password: string,
): Promise<string | null> {
  const { default: bcrypt } = await import("bcryptjs");
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();

  if (!normalizedEmail || !normalizedPassword) {
    // Still spend time comparing so we don't reveal "empty input" via timing.
    await bcrypt.compare("unused", DUMMY_BCRYPT_HASH);
    return null;
  }

  const user = getUsers().find((candidate) => candidate.email === normalizedEmail);
  const hashToCompare = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
  const matches = await bcrypt.compare(normalizedPassword, hashToCompare);

  if (!user || !matches) {
    return null;
  }

  return user.email;
}

export function hasSessionSecret() {
  return Boolean(clean(process.env.SESSION_SECRET));
}

export function hasOpenAIConfig() {
  return Boolean(clean(process.env.OPENAI_API_KEY));
}

export function hasGoogleConfig() {
  return Boolean(clean(process.env.GOOGLE_API_KEY));
}

export function hasOpenRouterConfig() {
  return Boolean(clean(process.env.OPENROUTER_API_KEY));
}

function hasAnthropicConfig() {
  return Boolean(clean(process.env.ANTHROPIC_API_KEY));
}

export function hasWhisperConfig() {
  return Boolean(clean(process.env.WHISPER_API_URL));
}

export function hasDatabaseConfig() {
  return Boolean(
    clean(process.env.DATABASE_URL_UNPOOLED) || clean(process.env.DATABASE_URL),
  );
}

export function hasBlobStoreConfig() {
  return Boolean(clean(process.env.BLOB_READ_WRITE_TOKEN));
}

export function hasSummaryConfig() {
  return hasOpenRouterConfig() || hasAnthropicConfig();
}

export function getSummaryModel() {
  return clean(process.env.SUMMARY_MODEL) || "anthropic/claude-3.5-haiku";
}

export function getOpenAITranscriptionModel() {
  return clean(process.env.TRANSCRIPTION_MODEL) || "gpt-4o-mini-transcribe";
}

export function getGeminiTranscriptionModel() {
  return clean(process.env.GEMINI_TRANSCRIPTION_MODEL) || "gemini-2.5-flash";
}

export function getVoxtralTranscriptionModel() {
  return (
    clean(process.env.VOXTRAL_TRANSCRIPTION_MODEL) ||
    "mistralai/voxtral-small-24b-2507"
  );
}

export function getDefaultTranscriptionProvider() {
  return clean(process.env.DEFAULT_TRANSCRIPTION_PROVIDER) || "gemini";
}

export function getWhisperApiUrl() {
  return clean(process.env.WHISPER_API_URL);
}

export function getBlobAudioMaxBytes() {
  const configuredValue = Number.parseInt(clean(process.env.BLOB_AUDIO_MAX_BYTES), 10);

  return Number.isFinite(configuredValue) && configuredValue > 0
    ? configuredValue
    : DEFAULT_BLOB_AUDIO_MAX_BYTES;
}
