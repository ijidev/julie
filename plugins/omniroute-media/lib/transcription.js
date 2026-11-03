import {
  assertOkOrThrowProviderError,
  buildAudioTranscriptionFormData,
  postMultipartRequest,
  readProviderJsonObjectResponse,
  requireTranscriptionText,
  resolveProviderHttpRequestConfig,
} from "openclaw/plugin-sdk/provider-http";

import {
  DEFAULT_BASE_URL,
  DEFAULT_TRANSCRIPTION_MODEL,
  PROVIDER_ID,
  asRecord,
  isLoopbackBaseUrl,
  isUsableCredentialValue,
  optionalString,
} from "./config.js";

function requestApiKey(req) {
  const auth = asRecord(req.auth);
  const value = auth?.kind === "api-key" ? auth.apiKey : req.apiKey;
  if (!isUsableCredentialValue(value)) {
    throw new Error("OmniRoute API key missing or still set to the `sk-` placeholder");
  }
  return value;
}

export function buildOmniRouteMediaUnderstandingProvider() {
  return {
    id: PROVIDER_ID,
    capabilities: ["audio"],
    defaultModels: { audio: DEFAULT_TRANSCRIPTION_MODEL },
    autoPriority: { audio: 30 },
    transcribeAudio: async (req) => {
      const apiKey = requestApiKey(req);
      const baseUrl = optionalString(req.baseUrl) ?? DEFAULT_BASE_URL;
      const model = optionalString(req.model) ?? DEFAULT_TRANSCRIPTION_MODEL;
      const request = resolveProviderHttpRequestConfig({
        baseUrl,
        defaultBaseUrl: DEFAULT_BASE_URL,
        allowPrivateNetwork: isLoopbackBaseUrl(baseUrl) ? true : undefined,
        headers: req.headers,
        request: req.request,
        defaultHeaders: { Authorization: `Bearer ${apiKey}` },
        provider: PROVIDER_ID,
        api: "omniroute-transcription",
        capability: "audio",
        transport: "media-understanding",
      });
      const temperature =
        typeof req.query?.temperature === "number" && Number.isFinite(req.query.temperature)
          ? String(req.query.temperature)
          : undefined;
      const form = buildAudioTranscriptionFormData({
        buffer: req.buffer,
        fileName: req.fileName,
        mime: req.mime,
        fields: {
          model,
          language: optionalString(req.language),
          prompt: optionalString(req.prompt),
          temperature,
        },
      });
      const { response, release } = await postMultipartRequest({
        url: `${request.baseUrl}/audio/transcriptions`,
        headers: request.headers,
        body: form,
        timeoutMs: req.timeoutMs,
        ...(req.signal ? { signal: req.signal } : {}),
        fetchFn: req.fetchFn ?? fetch,
        pinDns: false,
        allowPrivateNetwork: request.allowPrivateNetwork,
        dispatcherPolicy: request.dispatcherPolicy,
      });
      try {
        await assertOkOrThrowProviderError(response, "OmniRoute audio transcription failed", {
          requestHeaders: request.headers,
        });
        const payload = await readProviderJsonObjectResponse(
          response,
          "OmniRoute audio transcription failed",
          { requestHeaders: request.headers },
        );
        return {
          text: requireTranscriptionText(
            typeof payload.text === "string" ? payload.text : undefined,
            "OmniRoute transcription response missing text",
          ),
          model,
        };
      } finally {
        await release();
      }
    },
  };
}
