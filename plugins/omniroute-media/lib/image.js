import {
  createOpenAiCompatibleImageGenerationProvider,
  imageSourceUploadFileName,
} from "openclaw/plugin-sdk/image-generation";

import {
  DEFAULT_BASE_URL,
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
  PROVIDER_ID,
  PROVIDER_LABEL,
  configuredCredential,
  isLoopbackBaseUrl,
} from "./config.js";

function buildEditRequest({ req, inputImages, model, count }) {
  const form = new FormData();
  form.set("model", model);
  form.set("prompt", req.prompt);
  form.set("n", String(count));
  if (req.size) form.set("size", req.size);

  for (const [index, image] of inputImages.entries()) {
    const mimeType = image.mimeType || "image/png";
    form.append(
      "image",
      new Blob([image.buffer], { type: mimeType }),
      imageSourceUploadFileName({ image, index }),
    );
  }
  return { kind: "multipart", form };
}

export function buildOmniRouteImageProvider() {
  const provider = createOpenAiCompatibleImageGenerationProvider({
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    providerConfigKey: PROVIDER_ID,
    defaultModel: DEFAULT_IMAGE_MODEL,
    models: IMAGE_MODELS,
    capabilities: {
      generate: { maxCount: 1, supportsSize: true },
      edit: { enabled: true, maxCount: 1, maxInputImages: 1, supportsSize: true },
    },
    defaultBaseUrl: DEFAULT_BASE_URL,
    resolveAllowPrivateNetwork: ({ baseUrl }) => (isLoopbackBaseUrl(baseUrl) ? true : undefined),
    useConfiguredRequest: true,
    buildGenerateRequest: ({ req, model, count }) => ({
      kind: "json",
      body: {
        model,
        prompt: req.prompt,
        n: count,
        ...(req.size ? { size: req.size } : {}),
      },
    }),
    buildEditRequest,
    missingApiKeyError: "OmniRoute API key missing",
    failureLabels: {
      generate: "OmniRoute image generation failed",
      edit: "OmniRoute image edit failed",
    },
  });

  return {
    ...provider,
    // OpenClaw's generic presence check treats the literal `sk-` as configured.
    // Reject that known placeholder so status remains evidence-based.
    isConfigured: ({ cfg }) => Boolean(configuredCredential(cfg)),
  };
}
