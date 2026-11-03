import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";

import entry from "../index.js";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_TRANSCRIPTION_MODEL,
  audioFormatFromContentType,
  isLoopbackBaseUrl,
  isUsableCredentialValue,
  normalizeBaseUrl,
} from "../lib/config.js";

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const registrations = { image: [], media: [], speech: [] };
let server;
let baseUrl;
let requests = [];

before(async () => {
  entry.register({
    registerImageGenerationProvider(provider) {
      registrations.image.push(provider);
    },
    registerMediaUnderstandingProvider(provider) {
      registrations.media.push(provider);
    },
    registerSpeechProvider(provider) {
      registrations.speech.push(provider);
    },
  });

  server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    requests.push({ url: req.url, authorization: req.headers.authorization, body });

    if (req.url === "/v1/images/generations") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ b64_json: ONE_PIXEL_PNG }] }));
      return;
    }
    if (req.url === "/v1/audio/speech") {
      res.writeHead(200, { "content-type": "audio/wav" });
      res.end(Buffer.from("RIFF-fixture-wave"));
      return;
    }
    if (req.url === "/v1/audio/transcriptions") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ text: "fixture transcript" }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("registers all three native batch media capabilities", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(registrations).map(([key, rows]) => [key, rows.map((row) => row.id)])),
    { image: ["omniroute"], media: ["omniroute"], speech: ["omniroute"] },
  );
});

test("rejects placeholders and allows only valid URL schemes", () => {
  assert.equal(isUsableCredentialValue("sk-"), false);
  assert.equal(isUsableCredentialValue("fixture-valid-key"), true);
  assert.equal(isUsableCredentialValue({ source: "env", provider: "default", id: "OMNIROUTE_API_KEY" }), true);
  assert.equal(isLoopbackBaseUrl("http://localhost:20128/v1"), true);
  assert.equal(isLoopbackBaseUrl("https://example.com/v1"), false);
  assert.equal(normalizeBaseUrl("https://example.com/v1/"), "https://example.com/v1");
  assert.throws(() => normalizeBaseUrl("file:///tmp/not-allowed"), /HTTP or HTTPS/);
});

test("maps returned audio MIME types instead of claiming the requested format", () => {
  assert.deepEqual(audioFormatFromContentType("audio/wav", "mp3"), {
    outputFormat: "wav",
    fileExtension: ".wav",
    voiceCompatible: false,
  });
});

test("generates an image through the configured loopback OmniRoute endpoint", async () => {
  requests = [];
  const provider = registrations.image[0];
  const cfg = {
    models: {
      providers: {
        omniroute: { baseUrl, apiKey: "fixture-valid-key", models: [] },
      },
    },
  };
  assert.equal(provider.isConfigured({ cfg }), true);
  const result = await provider.generateImage({
    provider: "omniroute",
    model: DEFAULT_IMAGE_MODEL,
    prompt: "a geometric test image",
    cfg,
    authStore: { version: 1, profiles: {} },
    count: 1,
    timeoutMs: 5_000,
  });
  assert.equal(result.images.length, 1);
  assert.ok(result.images[0].buffer.length > 0);
  assert.equal(requests[0].url, "/v1/images/generations");
  // Keep credential material out of assertion diffs if auth resolution regresses.
  assert.equal(requests[0].authorization === "Bearer fixture-valid-key", true);
});

test("synthesizes speech and reports the provider's actual WAV output", async () => {
  requests = [];
  const provider = registrations.speech[0];
  const cfg = {
    models: {
      providers: {
        omniroute: { baseUrl, apiKey: "fixture-valid-key", models: [] },
      },
    },
  };
  const result = await provider.synthesize({
    text: "short fixture",
    cfg,
    providerConfig: { baseUrl, model: "nvidia/fastpitch", voice: "default", responseFormat: "wav" },
    target: "audio-file",
    timeoutMs: 5_000,
  });
  assert.equal(result.outputFormat, "wav");
  assert.equal(result.fileExtension, ".wav");
  assert.ok(result.audioBuffer.length > 0);
  assert.equal(requests[0].url, "/v1/audio/speech");
});

test("transcribes multipart audio through the configured loopback endpoint", async () => {
  requests = [];
  const provider = registrations.media[0];
  const result = await provider.transcribeAudio({
    apiKey: "fixture-valid-key",
    baseUrl,
    model: DEFAULT_TRANSCRIPTION_MODEL,
    buffer: Buffer.from("fixture-wave"),
    fileName: "fixture.wav",
    mime: "audio/wav",
    timeoutMs: 5_000,
  });
  assert.deepEqual(result, { text: "fixture transcript", model: DEFAULT_TRANSCRIPTION_MODEL });
  assert.equal(requests[0].url, "/v1/audio/transcriptions");
  assert.match(requests[0].body.toString("utf8"), /fixture\.wav/);
});
