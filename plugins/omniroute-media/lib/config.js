import { isIP } from "node:net";

export const PLUGIN_ID = "omniroute-media";
export const PROVIDER_ID = "omniroute";
export const PROVIDER_LABEL = "OmniRoute";
export const API_KEY_ENV = "OMNIROUTE_API_KEY";
export const DEFAULT_BASE_URL = "http://127.0.0.1:20128/v1";

// Verified against the local OmniRoute /v1/models catalog on 2026-10-28.
// The upstream remains visible in every model id; this adapter never presents
// an OpenRouter model as an OmniRoute-owned model.
export const IMAGE_MODELS = Object.freeze([
  "openrouter/openai/gpt-5.4-image-2",
  "openrouter/openai/gpt-5-image-mini",
  "openrouter/google/gemini-3.1-flash-image-preview",
  "openrouter/google/gemini-3-pro-image-preview",
  "openrouter/black-forest-labs/flux.2-max",
  "openrouter/black-forest-labs/flux.2-pro",
  "openrouter/black-forest-labs/flux.2-flex",
  "openrouter/openai/gpt-image-2.5-sunburst",
  "openrouter/openai/gpt-image-2.5-flare",
  "openrouter/microsoft/mai-image-2.6",
  "openrouter/microsoft/mai-image-2.6-flash",
]);
export const DEFAULT_IMAGE_MODEL = "openrouter/google/gemini-3.1-flash-image-preview";

// OmniRoute's live catalog exposes these as speech models through the configured
// NVIDIA connection. It does not currently expose OpenRouter TTS models.
export const SPEECH_MODELS = Object.freeze(["nvidia/fastpitch", "nvidia/tacotron2"]);
export const DEFAULT_SPEECH_MODEL = "nvidia/fastpitch";
export const DEFAULT_SPEECH_VOICE = "default";
export const DEFAULT_SPEECH_FORMAT = "wav";

export const TRANSCRIPTION_MODELS = Object.freeze([
  "openrouter/deepgram/nova-3",
  "openrouter/microsoft/mai-transcribe-1.5",
  "openrouter/nvidia/parakeet-tdt-0.6b-v3",
  "openrouter/mistralai/voxtral-mini-transcribe",
  "openrouter/qwen/qwen3-asr-flash-2026-02-10",
  "openrouter/google/chirp-3",
  "openrouter/openai/gpt-4o-mini-transcribe",
  "openrouter/openai/whisper-large-v3",
  "openrouter/openai/whisper-large-v3-turbo",
  "openrouter/openai/whisper-1",
  "openrouter/openai/gpt-4o-transcribe",
]);
export const DEFAULT_TRANSCRIPTION_MODEL = "openrouter/openai/whisper-large-v3-turbo";

export function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

export function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function isPlaceholderCredential(value) {
  const normalized = optionalString(value);
  return normalized === "sk-" || normalized === "changeme" || normalized === "placeholder";
}

export function isUsableCredentialValue(value) {
  const normalized = optionalString(value);
  if (normalized) return !isPlaceholderCredential(normalized);

  const ref = asRecord(value);
  return Boolean(
    ref &&
      optionalString(ref.source) &&
      optionalString(ref.id) &&
      (ref.provider === undefined || optionalString(ref.provider)),
  );
}

export function findProviderConfig(providers, providerId = PROVIDER_ID) {
  const entries = Object.entries(asRecord(providers) ?? {});
  const target = providerId.trim().toLowerCase();
  return asRecord(entries.find(([id]) => id.trim().toLowerCase() === target)?.[1]);
}

export function readModelProviderConfig(cfg) {
  return findProviderConfig(asRecord(asRecord(cfg)?.models)?.providers);
}

export function readSpeechProviderConfig(rawConfig) {
  const raw = asRecord(rawConfig) ?? {};
  return findProviderConfig(raw.providers) ?? asRecord(raw[PROVIDER_ID]) ?? {};
}

export function normalizeBaseUrl(value, fallback = DEFAULT_BASE_URL) {
  const raw = optionalString(value) ?? fallback;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("OmniRoute base URL must be a valid HTTP or HTTPS URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("OmniRoute base URL must use HTTP or HTTPS");
  }
  return raw.replace(/\/+$/u, "");
}

export function resolveBaseUrl(cfg, providerConfig) {
  return normalizeBaseUrl(
    optionalString(asRecord(providerConfig)?.baseUrl) ?? optionalString(readModelProviderConfig(cfg)?.baseUrl),
  );
}

export function isLoopbackBaseUrl(baseUrl) {
  const parsed = new URL(normalizeBaseUrl(baseUrl));
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "host.docker.internal" ||
    host === "::1" ||
    (isIP(host) === 4 && host.startsWith("127."))
  );
}

export function configuredCredential(cfg, providerConfig, env = process.env) {
  const direct = asRecord(providerConfig)?.apiKey;
  if (isUsableCredentialValue(direct)) return direct;
  const modelValue = readModelProviderConfig(cfg)?.apiKey;
  if (isUsableCredentialValue(modelValue)) return modelValue;
  const envValue = env[API_KEY_ENV];
  return isUsableCredentialValue(envValue) ? envValue : undefined;
}

export function normalizeSpeechConfig(rawConfig) {
  const raw = readSpeechProviderConfig(rawConfig);
  const responseFormat = optionalString(raw.responseFormat)?.toLowerCase() ?? DEFAULT_SPEECH_FORMAT;
  const supportedFormats = new Set(["mp3", "wav", "opus", "ogg", "pcm", "flac", "aac"]);
  if (!supportedFormats.has(responseFormat)) {
    throw new Error(`Unsupported OmniRoute speech response format: ${responseFormat}`);
  }
  return {
    apiKey: raw.apiKey,
    baseUrl: optionalString(raw.baseUrl),
    model: optionalString(raw.model ?? raw.modelId) ?? DEFAULT_SPEECH_MODEL,
    voice:
      optionalString(raw.speakerVoice ?? raw.speakerVoiceId ?? raw.voice ?? raw.voiceId) ??
      DEFAULT_SPEECH_VOICE,
    responseFormat,
    speed: typeof raw.speed === "number" && Number.isFinite(raw.speed) ? raw.speed : undefined,
  };
}

export function audioFormatFromContentType(contentType, requestedFormat = DEFAULT_SPEECH_FORMAT) {
  const mime = optionalString(contentType)?.split(";", 1)[0]?.trim().toLowerCase();
  const byMime = {
    "audio/wav": { outputFormat: "wav", fileExtension: ".wav", voiceCompatible: false },
    "audio/x-wav": { outputFormat: "wav", fileExtension: ".wav", voiceCompatible: false },
    "audio/mpeg": { outputFormat: "mp3", fileExtension: ".mp3", voiceCompatible: true },
    "audio/mp3": { outputFormat: "mp3", fileExtension: ".mp3", voiceCompatible: true },
    "audio/opus": { outputFormat: "opus", fileExtension: ".opus", voiceCompatible: true },
    "audio/ogg": { outputFormat: "ogg", fileExtension: ".ogg", voiceCompatible: true },
    "application/ogg": { outputFormat: "ogg", fileExtension: ".ogg", voiceCompatible: true },
    "audio/flac": { outputFormat: "flac", fileExtension: ".flac", voiceCompatible: false },
    "audio/aac": { outputFormat: "aac", fileExtension: ".aac", voiceCompatible: false },
    "audio/pcm": { outputFormat: "pcm", fileExtension: ".pcm", voiceCompatible: false },
  };
  return (
    byMime[mime] ?? {
      outputFormat: requestedFormat,
      fileExtension: `.${requestedFormat}`,
      voiceCompatible: requestedFormat === "mp3" || requestedFormat === "opus" || requestedFormat === "ogg",
    }
  );
}
