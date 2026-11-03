import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { PLUGIN_ID } from "./lib/config.js";
import { buildOmniRouteImageProvider } from "./lib/image.js";
import { buildOmniRouteSpeechProvider } from "./lib/speech.js";
import { buildOmniRouteMediaUnderstandingProvider } from "./lib/transcription.js";

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "OmniRoute Media Provider",
  description:
    "Native OmniRoute image generation, batch transcription, and text-to-speech capabilities.",
  register(api) {
    api.registerImageGenerationProvider(buildOmniRouteImageProvider());
    api.registerMediaUnderstandingProvider(buildOmniRouteMediaUnderstandingProvider());
    api.registerSpeechProvider(buildOmniRouteSpeechProvider());
  },
});
