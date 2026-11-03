# OmniRoute Media Provider

Private OpenClaw adapter for the OpenAI-compatible media routes exposed by
OmniRoute. It registers three **native OpenClaw capabilities** under provider id
`omniroute`:

- image generation and single-image editing (`/v1/images/*`)
- batch speech-to-text (`/v1/audio/transcriptions`)
- text-to-speech (`/v1/audio/speech`)

It deliberately does **not** register realtime transcription or full-duplex
realtime voice. The installed OmniRoute build does not expose a verified
realtime WebSocket contract compatible with OpenClaw Talk.

## Provenance

OmniRoute is the transport and routing provider. Upstream ownership remains
visible in model ids:

- image and STT defaults are `openrouter/...` models routed by OmniRoute
- TTS currently uses `nvidia/fastpitch`, because OmniRoute's live catalog does
  not expose OpenRouter TTS models

The adapter never labels an OpenRouter or NVIDIA model as OmniRoute-owned.

## Security properties

- The API key is resolved from `models.providers.omniroute.apiKey`, an optional
  `tts.providers.omniroute.apiKey`, or `OMNIROUTE_API_KEY`.
- The known invalid placeholder `sk-` does not count as configured.
- Loopback access is enabled only for `localhost`, loopback IPs, and
  `host.docker.internal`; other private-network targets remain subject to
  OpenClaw's SSRF policy.
- Provider errors use OpenClaw's bounded readers and credential redaction.
- Image output is capped at one asset per call.

## Configuration shape

The package does not install itself or mutate OpenClaw configuration. After a
backup and owner-approved installation, the relevant configuration shape is:

```json5
{
  models: {
    providers: {
      omniroute: {
        baseUrl: "http://127.0.0.1:20128/v1",
        apiKey: { source: "env", provider: "default", id: "OMNIROUTE_API_KEY" },
      },
    },
  },
  agents: {
    defaults: {
      mediaModels: {
        image: {
          primary: "omniroute/openrouter/google/gemini-3.1-flash-image-preview",
        },
      },
    },
  },
  tools: {
    media: {
      models: [
        {
          provider: "omniroute",
          model: "openrouter/openai/whisper-large-v3-turbo",
          capabilities: ["audio"],
        },
      ],
    },
  },
  tts: {
    provider: "omniroute",
    providers: {
      omniroute: {
        model: "nvidia/fastpitch",
        speakerVoice: "default",
        responseFormat: "wav",
      },
    },
  },
  talk: {
    provider: "omniroute",
    providers: {
      omniroute: {
        modelId: "nvidia/fastpitch",
        voiceId: "default",
        responseFormat: "wav",
      },
    },
    realtime: {
      mode: "stt-tts",
    },
  },
}
```

Do not set `tts.auto: "always"` unless automatic audio attachments are
intentional. Selecting a model is not proof of entitlement, remaining quota, or
price; perform provider/cost review before a live generation call.

## Development checks

The plugin has no runtime dependencies beyond its OpenClaw peer:

```bash
npm test
npm run validate
npm pack --pack-destination /tmp/opencode
```
