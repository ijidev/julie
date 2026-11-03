import {
  assertOkOrThrowProviderError,
  postJsonRequest,
  readProviderBinaryResponse,
  resolveProviderHttpRequestConfig,
} from "openclaw/plugin-sdk/provider-http";
import { resolveConfiguredSecretInputWithFallback } from "openclaw/plugin-sdk/secret-input-runtime";

import {
  API_KEY_ENV,
  DEFAULT_BASE_URL,
  DEFAULT_SPEECH_FORMAT,
  DEFAULT_SPEECH_MODEL,
  DEFAULT_SPEECH_VOICE,
  PROVIDER_ID,
  PROVIDER_LABEL,
  SPEECH_MODELS,
  asRecord,
  audioFormatFromContentType,
  configuredCredential,
  isLoopbackBaseUrl,
  isUsableCredentialValue,
  normalizeSpeechConfig,
  optionalString,
  readModelProviderConfig,
  resolveBaseUrl,
} from "./config.js";

async function resolveCredentialValue({ cfg, providerConfig }) {
  const direct = asRecord(providerConfig)?.apiKey;
  if (direct !== undefined) {
    const resolved = await resolveConfiguredSecretInputWithFallback({
      config: cfg,
      env: process.env,
      value: direct,
      path: "tts.providers.omniroute.apiKey",
    });
    if (isUsableCredentialValue(resolved.value)) return resolved.value;
    if (resolved.secretRefConfigured) {
      throw new Error(resolved.unresolvedRefReason || "OmniRoute TTS API key SecretRef is unavailable");
    }
  }

  const modelValue = readModelProviderConfig(cfg)?.apiKey;
  if (modelValue !== undefined) {
    const resolved = await resolveConfiguredSecretInputWithFallback({
      config: cfg,
      env: process.env,
      value: modelValue,
      path: "models.providers.omniroute.apiKey",
      readFallback: () => process.env[API_KEY_ENV],
    });
    if (isUsableCredentialValue(resolved.value)) return resolved.value;
    if (resolved.secretRefConfigured) {
      throw new Error(resolved.unresolvedRefReason || "OmniRoute API key SecretRef is unavailable");
    }
  }

  const envValue = process.env[API_KEY_ENV];
  if (isUsableCredentialValue(envValue)) return envValue;
  throw new Error("OmniRoute API key missing or still set to the `sk-` placeholder");
}

function parseDirectiveToken(ctx) {
  const key = ctx.key.toLowerCase();
  if (["voice", "voice_id", "voiceid", "omniroute_voice", "omniroutevoice"].includes(key)) {
    return ctx.policy.allowVoice
      ? { handled: true, overrides: { ...(ctx.currentOverrides ?? {}), voice: ctx.value } }
      : { handled: true };
  }
  if (["model", "model_id", "modelid", "omniroute_model", "omniroutemodel"].includes(key)) {
    return ctx.policy.allowModelId
      ? { handled: true, overrides: { ...(ctx.currentOverrides ?? {}), model: ctx.value } }
      : { handled: true };
  }
  return { handled: false };
}

export function buildOmniRouteSpeechProvider() {
  return {
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    autoSelectOrder: 30,
    defaultTimeoutMs: 120_000,
    defaultModel: DEFAULT_SPEECH_MODEL,
    models: SPEECH_MODELS,
    voices: [DEFAULT_SPEECH_VOICE],
    resolveConfig: ({ rawConfig }) => normalizeSpeechConfig(rawConfig),
    parseDirectiveToken,
    resolveTalkConfig: ({ baseTtsConfig, talkProviderConfig }) => {
      const base = normalizeSpeechConfig(baseTtsConfig);
      return normalizeSpeechConfig({
        providers: {
          [PROVIDER_ID]: {
            ...base,
            ...asRecord(talkProviderConfig),
          },
        },
      });
    },
    resolveTalkOverrides: ({ params }) => ({
      ...(optionalString(params.modelId ?? params.model)
        ? { model: optionalString(params.modelId ?? params.model) }
        : {}),
      ...(optionalString(params.voiceId ?? params.voice)
        ? { voice: optionalString(params.voiceId ?? params.voice) }
        : {}),
      ...(typeof params.speed === "number" && Number.isFinite(params.speed)
        ? { speed: params.speed }
        : {}),
    }),
    listVoices: async () => [{ id: DEFAULT_SPEECH_VOICE, name: "Provider default" }],
    isConfigured: ({ cfg, providerConfig }) => Boolean(configuredCredential(cfg, providerConfig)),
    synthesize: async (req) => {
      const config = { ...normalizeSpeechConfig({ providers: { [PROVIDER_ID]: req.providerConfig } }) };
      const overrides = asRecord(req.providerOverrides) ?? {};
      const apiKey = await resolveCredentialValue({ cfg: req.cfg, providerConfig: req.providerConfig });
      const baseUrl = resolveBaseUrl(req.cfg, req.providerConfig);
      const model = optionalString(overrides.model ?? overrides.modelId) ?? config.model ?? DEFAULT_SPEECH_MODEL;
      const voice = optionalString(overrides.voice ?? overrides.voiceId) ?? config.voice ?? DEFAULT_SPEECH_VOICE;
      const responseFormat = config.responseFormat ?? DEFAULT_SPEECH_FORMAT;
      const speed =
        typeof overrides.speed === "number" && Number.isFinite(overrides.speed)
          ? overrides.speed
          : config.speed;

      const request = resolveProviderHttpRequestConfig({
        baseUrl,
        defaultBaseUrl: DEFAULT_BASE_URL,
        allowPrivateNetwork: isLoopbackBaseUrl(baseUrl) ? true : undefined,
        defaultHeaders: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        provider: PROVIDER_ID,
        api: "omniroute-speech",
        capability: "audio",
        transport: "http",
      });
      const { response, release } = await postJsonRequest({
        url: `${request.baseUrl}/audio/speech`,
        headers: request.headers,
        body: {
          model,
          input: req.text,
          voice,
          response_format: responseFormat,
          ...(speed === undefined ? {} : { speed }),
        },
        timeoutMs: req.timeoutMs,
        fetchFn: fetch,
        allowPrivateNetwork: request.allowPrivateNetwork,
        dispatcherPolicy: request.dispatcherPolicy,
      });
      try {
        await assertOkOrThrowProviderError(response, "OmniRoute TTS API error", {
          requestHeaders: request.headers,
        });
        const audioBuffer = await readProviderBinaryResponse(
          response,
          "OmniRoute TTS API error",
          "audio",
          { requestHeaders: request.headers },
        );
        return {
          audioBuffer,
          ...audioFormatFromContentType(response.headers.get("content-type"), responseFormat),
        };
      } finally {
        await release();
      }
    },
  };
}
