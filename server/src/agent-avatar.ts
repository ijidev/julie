import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { db } from "./db.js";
import { gateway, type GatewayAgent } from "./gateway.js";
import { getAgentProfile } from "./agent-profiles.js";

const AVATAR_ROOT = path.join(config.dataDir, "agent-avatars");
const AVATAR_MODEL_ROOT = path.join(config.dataDir, "agent-avatar-models");
const LOCAL_ASSET_MAX_BYTES = 8 * 1024 * 1024;
const GATEWAY_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const LOCAL_MODEL_MAX_BYTES = 8 * 1024 * 1024;
const PROVIDER_CACHE_MS = 60_000;

export const AVATAR_DIRECTIONS = [
  {
    id: "synthetic_hologram",
    label: "Synthetic hologram",
    description: "A cinematic non-human AI bust made from translucent light and engineered surfaces.",
  },
  {
    id: "abstract_core",
    label: "Abstract intelligence core",
    description: "A recognizable geometric energy core with no body or human characteristics.",
  },
  {
    id: "emblematic_guardian",
    label: "Emblematic guardian",
    description: "A non-human command-center guardian mask built from glass, metal, and light.",
  },
] as const;

export type AvatarDirection = (typeof AVATAR_DIRECTIONS)[number]["id"];

type AvatarAssetRow = {
  id: number;
  agent_id: string;
  file_name: string;
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  sha256: string;
  size_bytes: number;
  provider: string;
  model: string;
  prompt: string;
  prompt_hash: string;
  cost_state: "reported" | "not_reported";
  cost_usd: number | null;
  gateway_applied: 0 | 1;
  created_at: string;
  applied_at: string | null;
};

type PublicAvatarModel = {
  id: string;
  ref: string;
  isDefault: boolean;
  generateMaxCount: number;
  supports: {
    size: boolean;
    aspectRatio: boolean;
    resolution: boolean;
    sizes: string[];
    aspectRatios: string[];
    resolutions: string[];
    formats: string[];
    qualities: string[];
    backgrounds: string[];
  };
  cost: {
    state: "not_reported";
    estimateUsd: null;
    currency: "USD";
    mayCharge: true;
    disclosure: string;
    pricingUrl: string | null;
  };
};

type PublicAvatarProvider = {
  id: string;
  label: string;
  configured: boolean;
  runtimeState: "not_configured" | "not_supported" | "configured_unverified" | "last_attempt_failed" | "generation_succeeded";
  lastAttemptAt: string | null;
  unavailableReason: string | null;
  defaultModel: string | null;
  models: PublicAvatarModel[];
};

type AvatarModelRow = {
  id: number;
  agent_id: string;
  source_type: "upload" | "https_url";
  file_name: string | null;
  source_url: string | null;
  mime_type: "model/gltf-binary";
  sha256: string | null;
  size_bytes: number | null;
  created_at: string;
};

export class AgentAvatarError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AgentAvatarError";
    this.status = status;
  }
}

const providerCache = new Map<string, { expiresAt: number; providers: PublicAvatarProvider[] }>();
const generationInFlight = new Set<string>();

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\0\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function stringList(value: unknown, maxItems = 30, maxLength = 100): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function hasSecretShape(value: string): boolean {
  return /-----BEGIN [^-\n]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|client[_ -]?secret)\s*[:=]/i.test(value);
}

function safeContext(value: unknown, max = 700): string {
  if (typeof value !== "string") return "";
  const withoutCode = value
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ");
  return withoutCode.split("\n")
    .map((line) => line.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "").trim())
    .filter((line) => line && !hasSecretShape(line) && !/(?:\/home\/|\/Users\/)[^\s`"'<>)]*/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function safeSoulContext(value: unknown): string {
  if (typeof value !== "string") return "";
  const startMarker = "<!-- JULIE-HR:START -->";
  const endMarker = "<!-- JULIE-HR:END -->";
  const start = value.indexOf(startMarker);
  const end = value.indexOf(endMarker);
  const ownedBlock = start >= 0 && end > start ? value.slice(start + startMarker.length, end) : value;
  return safeContext(ownedBlock, 700);
}

function ensureDirection(value: unknown): AvatarDirection {
  const direction = typeof value === "string" ? value : "synthetic_hologram";
  if (!AVATAR_DIRECTIONS.some((entry) => entry.id === direction)) throw new AgentAvatarError("valid avatar direction required");
  return direction as AvatarDirection;
}

function cleanOwnerNotes(value: unknown): string {
  const notes = text(value, 500);
  if (hasSecretShape(notes) || /(?:\/home\/|\/Users\/)[^\s`"'<>)]*/i.test(notes)) {
    throw new AgentAvatarError("avatar notes must not contain credentials or private host paths");
  }
  return notes;
}

function pricingUrl(providerId: string, modelId: string): string | null {
  if (providerId === "openai") return "https://platform.openai.com/docs/pricing";
  if (providerId === "openrouter") return `https://openrouter.ai/${encodeURI(modelId)}`;
  return null;
}

function providerStateMap() {
  const rows = db.prepare("SELECT provider_id, state, last_attempt_at FROM agent_avatar_provider_state").all() as Array<{
    provider_id: string;
    state: "configured_unverified" | "last_attempt_failed" | "generation_succeeded";
    last_attempt_at: string | null;
  }>;
  return new Map(rows.map((row) => [row.provider_id, row]));
}

function recordProviderState(providerId: string, state: "last_attempt_failed" | "generation_succeeded") {
  db.prepare(`
    INSERT INTO agent_avatar_provider_state (provider_id, state, last_attempt_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(provider_id) DO UPDATE SET
      state = excluded.state,
      last_attempt_at = excluded.last_attempt_at,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).run(providerId, state);
  providerCache.clear();
}

function modelCapabilities(provider: any, entry: any) {
  const capabilities = entry?.capabilities && typeof entry.capabilities === "object" ? entry.capabilities : provider?.capabilities ?? {};
  const generate = capabilities?.generate && typeof capabilities.generate === "object" ? capabilities.generate : {};
  const geometry = capabilities?.geometry && typeof capabilities.geometry === "object" ? capabilities.geometry : {};
  const output = capabilities?.output && typeof capabilities.output === "object" ? capabilities.output : {};
  return {
    generateMaxCount: typeof generate.maxCount === "number" && Number.isFinite(generate.maxCount) ? Math.max(1, Math.floor(generate.maxCount)) : 1,
    supports: {
      size: generate.supportsSize === true,
      aspectRatio: generate.supportsAspectRatio === true,
      resolution: generate.supportsResolution === true,
      sizes: stringList(geometry.sizes, 20, 30),
      aspectRatios: stringList(geometry.aspectRatios, 30, 20),
      resolutions: stringList(geometry.resolutions, 10, 20),
      formats: stringList(output.formats, 10, 20),
      qualities: stringList(output.qualitiesByModel?.[entry?.model] ?? output.qualities, 10, 20),
      backgrounds: stringList(output.backgroundsByModel?.[entry?.model] ?? output.backgrounds, 10, 20),
    },
  };
}

function projectProviders(raw: any): PublicAvatarProvider[] {
  const rows = Array.isArray(raw?.output?.details?.providers) ? raw.output.details.providers : [];
  const states = providerStateMap();
  return rows.slice(0, 30).map((provider: any) => {
    const id = text(provider?.id, 100);
    const defaultModel = text(provider?.defaultModel, 300) || null;
    const catalog = Array.isArray(provider?.catalog) && provider.catalog.length
      ? provider.catalog
      : stringList(provider?.models, 100, 300).map((model) => ({ model, capabilities: provider?.capabilities }));
    const models: PublicAvatarModel[] = catalog.slice(0, 100).flatMap((entry: any) => {
      const modelId = text(entry?.model, 300);
      if (!id || !modelId) return [];
      const capabilities = modelCapabilities(provider, entry);
      return [{
        id: modelId,
        ref: `${id}/${modelId}`,
        isDefault: defaultModel === modelId,
        ...capabilities,
        cost: {
          state: "not_reported" as const,
          estimateUsd: null,
          currency: "USD" as const,
          mayCharge: true as const,
          disclosure: "The live OpenClaw image catalog does not report a per-call estimate. A generation may consume provider quota or billed usage; the exact charge may remain unavailable to Julie.",
          pricingUrl: pricingUrl(id, modelId),
        },
      }];
    });
    const configured = provider?.configured === true;
    const runtime = states.get(id);
    return {
      id,
      label: text(provider?.label, 150) || id,
      configured,
      runtimeState: configured ? runtime?.state ?? "configured_unverified" : "not_configured",
      lastAttemptAt: runtime?.last_attempt_at ?? null,
      unavailableReason: configured ? null : "This provider is registered but is not configured for image generation.",
      defaultModel,
      models,
    };
  }).filter((provider: PublicAvatarProvider) => provider.id && provider.models.length > 0);
}

async function readProviders(agentId: string, force = false): Promise<PublicAvatarProvider[]> {
  const cached = providerCache.get(agentId);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.providers;
  const [result, modelCatalog] = await Promise.all([
    gateway.invokeTool({
      name: "image_generate",
      agentId,
      sessionKey: `agent:${agentId}:julie-avatar-inspection`,
      args: { action: "list" },
      timeoutMs: 60_000,
    }),
    gateway.listModels(),
  ]);
  if (result?.ok !== true) throw new AgentAvatarError(text(result?.error?.message, 500) || "image generation provider discovery failed", 503);
  // Owner policy: OpenRouter is intentionally excluded. OmniRoute may be used
  // only if OpenClaw registers it in image_generate; text model availability is
  // not relabeled as image-generation support.
  const discovered = projectProviders(result).filter((provider) => provider.id === "openai" || provider.id === "omniroute");
  const omniRouteRows = (Array.isArray(modelCatalog?.models) ? modelCatalog.models : []).filter((model: any) => model?.provider === "omniroute");
  const providers = discovered.some((provider) => provider.id === "omniroute") ? discovered : [...discovered, {
    id: "omniroute",
    label: "OmniRoute",
    configured: false,
    runtimeState: "not_supported" as const,
    lastAttemptAt: null,
    unavailableReason: `${omniRouteRows.length} configured OmniRoute model row${omniRouteRows.length === 1 ? " is" : "s are"} present, but OpenClaw image_generate does not register OmniRoute as an image provider.`,
    defaultModel: null,
    models: [],
  }];
  providerCache.set(agentId, { expiresAt: Date.now() + PROVIDER_CACHE_MS, providers });
  return providers;
}

function agentIdentity(agent: GatewayAgent) {
  const identity = agent.identity && typeof agent.identity === "object" ? agent.identity : {};
  return {
    displayName: text(identity.name, 200) || text(agent.name, 200) || agent.id,
    theme: text(identity.theme, 500),
    emoji: text(identity.emoji, 20),
    gatewayAvatarConfigured: typeof identity.avatar === "string" && Boolean(identity.avatar.trim()),
  };
}

async function avatarContext(agentId: string) {
  const roster = await gateway.getAgentRoster();
  const agent = roster.agents.find((entry) => entry.id === agentId);
  if (!agent) throw new AgentAvatarError("agent not found", 404);
  const identity = agentIdentity(agent);
  const profile = getAgentProfile(agentId);
  let soulContext = "";
  try {
    const soul = await gateway.getAgentFile(agentId, "SOUL.md");
    soulContext = safeSoulContext(soul?.file?.content);
  } catch {
    // A missing/unreadable SOUL is an honest absent source, not a preview failure.
  }
  return {
    ...identity,
    role: safeContext(profile?.role, 160),
    personality: safeContext(profile?.personality, 700),
    soulContext,
  };
}

function buildAvatarPrompt(context: Awaited<ReturnType<typeof avatarContext>>, direction: AvatarDirection, ownerNotes: string) {
  const directionText: Record<AvatarDirection, string> = {
    synthetic_hologram: "A clearly synthetic, non-human AI bust made from translucent glass, engineered surfaces, volumetric light, and restrained circuit details.",
    abstract_core: "A singular abstract intelligence core made from layered geometry, luminous energy, and precise orbital structures; no face or body.",
    emblematic_guardian: "A clearly non-human command-center guardian mask made from glass, brushed metal, and holographic light; symbolic rather than anatomical.",
  };
  const fact = (label: string, value: string) => value ? `${label}: ${value.replace(/[.!?]+$/, "")}.` : "";
  const contextLines = [
    fact("Declared Julie role", context.role),
    fact("Owner-authored working style", context.personality),
    fact("Configured identity theme", context.theme),
    fact("Safe SOUL context", context.soulContext),
    fact("Configured symbolic marker", context.emoji),
    fact("Explicit owner-reviewed visual notes", ownerNotes),
  ].filter(Boolean).join("\n");
  const prompt = [
    `Create one square command-center avatar for the AI agent named ${JSON.stringify(context.displayName)}.`,
    directionText[direction],
    contextLines,
    "Translate only the supplied role, working style, theme, and symbols into lighting, materials, posture, geometry, and small non-text props.",
    "Do not infer or depict human gender, age, ethnicity, skin tone, nationality, body type, disability, religion, or resemblance to a real person.",
    "Visual treatment: polished cinematic 3D hologram, realistic glass and metal materials, deep navy-black background, warm amber-orange key light with subtle cool-blue edge light, centered head-and-shoulders or emblem composition, high contrast, recognizable at 64 pixels.",
    "No words, letters, logos, captions, watermark, border, collage, extra characters, gore, or weapons.",
  ].filter(Boolean).join("\n").slice(0, 4_000);
  const promptHash = crypto.createHash("sha256").update(prompt).digest("hex");
  const sources = [
    context.role ? "Julie role" : null,
    context.personality ? "Julie personality" : null,
    context.theme ? "Gateway identity theme" : null,
    context.soulContext ? "safe SOUL summary" : null,
    context.emoji ? "Gateway emoji" : null,
    ownerNotes ? "explicit owner notes" : null,
  ].filter((entry): entry is string => Boolean(entry));
  return {
    direction,
    ownerNotes,
    prompt,
    promptHash,
    sources,
    inferredAppearance: false as const,
    guardrail: "No human demographic or real-person appearance attributes are inferred.",
  };
}

function publicAsset(row: AvatarAssetRow) {
  return {
    id: row.id,
    url: `/api/agents/${encodeURIComponent(row.agent_id)}/avatar/assets/${row.id}`,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    provider: row.provider,
    model: row.model,
    promptHash: row.prompt_hash,
    cost: {
      state: row.cost_state,
      usd: row.cost_state === "reported" ? row.cost_usd : null,
    },
    applied: row.gateway_applied === 1,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    canApply: row.size_bytes <= GATEWAY_AVATAR_MAX_BYTES,
  };
}

function avatarRows(agentId: string): AvatarAssetRow[] {
  return db.prepare("SELECT * FROM agent_avatar_assets WHERE agent_id = ? ORDER BY id DESC LIMIT 12").all(agentId) as AvatarAssetRow[];
}

function publicAvatarModel(row: AvatarModelRow) {
  return {
    id: row.id,
    sourceType: row.source_type,
    url: row.source_type === "upload"
      ? `/api/agents/${encodeURIComponent(row.agent_id)}/avatar/models/${row.id}`
      : row.source_url,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    createdAt: row.created_at,
    gatewayCompatible: false as const,
    viewerState: "not_configured" as const,
  };
}

function avatarModelRows(agentId: string): AvatarModelRow[] {
  return db.prepare("SELECT * FROM agent_avatar_models WHERE agent_id = ? ORDER BY id DESC LIMIT 12").all(agentId) as AvatarModelRow[];
}

export async function getAgentAvatarStudio(agentId: string, force = false) {
  const [context, providers] = await Promise.all([avatarContext(agentId), readProviders(agentId, force)]);
  const preview = buildAvatarPrompt(context, "synthetic_hologram", "");
  const assets = avatarRows(agentId).map(publicAsset);
  return {
    ok: true,
    source: "gateway+local",
    generatedAt: new Date().toISOString(),
    agent: {
      id: agentId,
      displayName: context.displayName,
      gatewayAvatarConfigured: context.gatewayAvatarConfigured,
    },
    readiness: {
      tool: "image_generate",
      available: providers.length > 0,
      configuredProviderCount: providers.filter((provider) => provider.configured).length,
      verifiedUsableProviderCount: providers.filter((provider) => provider.runtimeState === "generation_succeeded").length,
      failedProviderCount: providers.filter((provider) => provider.runtimeState === "last_attempt_failed").length,
      policy: "One owner-confirmed square image per request. Generation and applying are separate actions.",
    },
    providers,
    directions: AVATAR_DIRECTIONS,
    preview,
    fallback: {
      kind: "deterministic_svg",
      url: `/api/agents/${encodeURIComponent(agentId)}/avatar/fallback.svg`,
      billed: false,
      inferredAppearance: false,
    },
    assets,
    activeAsset: assets.find((asset) => asset.applied) ?? null,
    models3d: avatarModelRows(agentId).map(publicAvatarModel),
    model3dBoundary: "GLB files and HTTPS GLB references are Julie-only companion assets. OpenClaw agents.update accepts an image avatar, and Julie has no 3D viewer configured yet.",
  };
}

export async function previewAgentAvatar(agentId: string, raw: any) {
  const context = await avatarContext(agentId);
  return {
    ok: true,
    source: "gateway+local",
    preview: buildAvatarPrompt(context, ensureDirection(raw?.direction), cleanOwnerNotes(raw?.ownerNotes)),
    fallback: {
      kind: "deterministic_svg",
      url: `/api/agents/${encodeURIComponent(agentId)}/avatar/fallback.svg`,
      billed: false,
      inferredAppearance: false,
    },
  };
}

function safeAssetPath(fileName: string): string {
  const root = path.resolve(AVATAR_ROOT);
  const target = path.resolve(root, fileName);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new AgentAvatarError("stored avatar path is invalid", 500);
  return target;
}

function detectImage(bytes: Buffer): { mimeType: AvatarAssetRow["mime_type"]; extension: string } | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mimeType: "image/png", extension: "png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mimeType: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return { mimeType: "image/webp", extension: "webp" };
  return null;
}

function generatedPath(result: any): string {
  const details = result?.output?.details;
  const attachments = Array.isArray(details?.attachments)
    ? details.attachments
    : Array.isArray(details?.media?.attachments) ? details.media.attachments : [];
  const attachment = attachments.find((entry: any) => entry?.type === "image" && typeof entry?.path === "string");
  const candidate = attachment?.path ?? (Array.isArray(details?.paths) ? details.paths.find((entry: unknown) => typeof entry === "string") : null);
  if (typeof candidate !== "string" || !candidate.trim()) throw new AgentAvatarError("Gateway completed generation without returning a readable image attachment", 502);
  const raw = candidate.trim().replace(/^MEDIA:/, "");
  if (raw.startsWith("file://")) return new URL(raw).pathname;
  if (!path.isAbsolute(raw)) throw new AgentAvatarError("Gateway returned a non-local generated image reference", 502);
  return raw;
}

function reportedCost(details: any): number | null {
  const candidates = [details?.cost, details?.costUsd, details?.usage?.cost, details?.metadata?.cost, details?.metadata?.usage?.cost];
  return candidates.find((value) => typeof value === "number" && Number.isFinite(value) && value >= 0) ?? null;
}

async function storeGeneratedAsset(agentId: string, prompt: string, promptHash: string, provider: string, model: string, result: any) {
  const source = generatedPath(result);
  const lstat = await fs.promises.lstat(source).catch(() => null);
  if (!lstat?.isFile() || lstat.isSymbolicLink()) throw new AgentAvatarError("Gateway generated image is not a regular local file", 502);
  if (lstat.size <= 0 || lstat.size > LOCAL_ASSET_MAX_BYTES) throw new AgentAvatarError("Generated image exceeds Julie's 8 MB local asset limit", 502);
  const bytes = await fs.promises.readFile(source);
  const detected = detectImage(bytes);
  if (!detected) throw new AgentAvatarError("Gateway generated an unsupported image format", 502);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const agentDir = crypto.createHash("sha256").update(agentId).digest("hex").slice(0, 20);
  const fileName = `${agentDir}/${sha256}.${detected.extension}`;
  const destination = safeAssetPath(fileName);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(destination, bytes, { mode: 0o600, flag: "wx" }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
    const existing = await fs.promises.readFile(destination);
    if (crypto.createHash("sha256").update(existing).digest("hex") !== sha256) throw new AgentAvatarError("Local avatar asset collision", 500);
  });
  await fs.promises.chmod(destination, 0o600);
  const cost = reportedCost(result?.output?.details);
  db.prepare(`
    INSERT OR IGNORE INTO agent_avatar_assets (
      agent_id, file_name, mime_type, sha256, size_bytes, provider, model,
      prompt, prompt_hash, cost_state, cost_usd
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(agentId, fileName, detected.mimeType, sha256, bytes.length, provider, model, prompt, promptHash, cost === null ? "not_reported" : "reported", cost);
  const row = db.prepare("SELECT * FROM agent_avatar_assets WHERE agent_id = ? AND file_name = ?").get(agentId, fileName) as AvatarAssetRow | undefined;
  if (!row) throw new AgentAvatarError("Generated avatar was saved but its metadata could not be read", 500);
  return publicAsset(row);
}

function generationArgs(model: PublicAvatarModel, prompt: string) {
  const args: Record<string, unknown> = {
    action: "generate",
    prompt,
    model: model.ref,
    count: 1,
    timeoutMs: 600_000,
  };
  if (model.supports.size) args.size = model.supports.sizes.includes("1024x1024") ? "1024x1024" : model.supports.sizes[0];
  if (!model.supports.size && model.supports.aspectRatio) args.aspectRatio = model.supports.aspectRatios.includes("1:1") ? "1:1" : model.supports.aspectRatios[0];
  if (model.supports.resolution) args.resolution = model.supports.resolutions.includes("1K") ? "1K" : model.supports.resolutions[0];
  if (model.supports.qualities.includes("low")) args.quality = "low";
  if (model.supports.formats.includes("jpeg")) args.outputFormat = "jpeg";
  if (model.supports.backgrounds.includes("opaque")) args.background = "opaque";
  if (model.ref.startsWith("openai/") && model.supports.formats.includes("jpeg")) args.openai = { outputCompression: 82 };
  return args;
}

export async function generateAgentAvatar(agentId: string, raw: any) {
  if (raw?.confirmed !== true) throw new AgentAvatarError("generation review confirmation required");
  if (raw?.costAcknowledged !== true) throw new AgentAvatarError("provider cost acknowledgement required");
  if (generationInFlight.has(agentId)) throw new AgentAvatarError("an avatar generation is already running for this agent", 409);
  const direction = ensureDirection(raw?.direction);
  const ownerNotes = cleanOwnerNotes(raw?.ownerNotes);
  const preview = buildAvatarPrompt(await avatarContext(agentId), direction, ownerNotes);
  const expectedHash = text(raw?.promptHash, 128);
  if (!expectedHash || expectedHash !== preview.promptHash) throw new AgentAvatarError("avatar prompt changed; review the latest preview before generating", 409);
  const providers = await readProviders(agentId, true);
  const providerId = text(raw?.provider, 100);
  const modelId = text(raw?.model, 300);
  const provider = providers.find((entry) => entry.id === providerId && entry.configured);
  const model = provider?.models.find((entry) => entry.id === modelId);
  if (!provider || !model) throw new AgentAvatarError("selected image provider/model is not currently configured", 409);

  generationInFlight.add(agentId);
  const started = Date.now();
  try {
    let result: any;
    try {
      result = await gateway.invokeTool({
        name: "image_generate",
        agentId,
        sessionKey: `agent:${agentId}:julie-avatar-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`,
        args: generationArgs(model, preview.prompt),
        confirm: true,
        timeoutMs: 630_000,
      });
    } catch (error) {
      recordProviderState(provider.id, "last_attempt_failed");
      throw error;
    }
    if (result?.ok !== true) {
      recordProviderState(provider.id, "last_attempt_failed");
      throw new AgentAvatarError(text(result?.error?.message, 500) || "Gateway image generation failed", 502);
    }
    if (result?.output?.details?.async === true) throw new AgentAvatarError("Gateway detached this generation before returning an asset; Julie did not apply an image", 502);
    recordProviderState(provider.id, "generation_succeeded");
    const asset = await storeGeneratedAsset(agentId, preview.prompt, preview.promptHash, provider.id, model.id, result);
    db.prepare("INSERT INTO audit_logs (command, exit_code, duration_ms) VALUES (?, 0, ?)")
      .run(`avatar.generate:${agentId}:${provider.id}/${model.id}`, Date.now() - started);
    return {
      ok: true,
      source: "gateway+local",
      status: "stored",
      applied: false,
      provider: { id: provider.id, label: provider.label },
      model: model.id,
      promptHash: preview.promptHash,
      asset,
      disclosure: asset.cost.state === "reported"
        ? `The provider result reported a $${asset.cost.usd?.toFixed(6)} USD charge.`
        : "The Gateway result did not report a final charge; provider quota or billing may still have been consumed.",
    };
  } finally {
    generationInFlight.delete(agentId);
  }
}

export async function applyAgentAvatar(agentId: string, assetId: number, confirmed: boolean) {
  if (!confirmed) throw new AgentAvatarError("generated image review confirmation required");
  const row = db.prepare("SELECT * FROM agent_avatar_assets WHERE id = ? AND agent_id = ?").get(assetId, agentId) as AvatarAssetRow | undefined;
  if (!row) throw new AgentAvatarError("avatar asset not found", 404);
  const filePath = safeAssetPath(row.file_name);
  const bytes = await fs.promises.readFile(filePath).catch(() => null);
  if (!bytes || bytes.length !== row.size_bytes || crypto.createHash("sha256").update(bytes).digest("hex") !== row.sha256) {
    throw new AgentAvatarError("stored avatar asset failed integrity validation", 409);
  }
  if (bytes.length > GATEWAY_AVATAR_MAX_BYTES) {
    throw new AgentAvatarError("stored image is larger than the 2 MB Gateway avatar safety limit", 409);
  }
  await gateway.updateAgent({ agentId, avatar: `data:${row.mime_type};base64,${bytes.toString("base64")}` });
  const transaction = db.transaction(() => {
    db.prepare("UPDATE agent_avatar_assets SET gateway_applied = 0, applied_at = NULL WHERE agent_id = ?").run(agentId);
    db.prepare("UPDATE agent_avatar_assets SET gateway_applied = 1, applied_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND agent_id = ?").run(assetId, agentId);
  });
  transaction();
  db.prepare("INSERT INTO audit_logs (command, exit_code, duration_ms) VALUES (?, 0, 0)").run(`avatar.apply:${agentId}:${assetId}`);
  const updated = db.prepare("SELECT * FROM agent_avatar_assets WHERE id = ?").get(assetId) as AvatarAssetRow;
  return {
    ok: true,
    source: "gateway+local",
    agentId,
    applied: true,
    asset: publicAsset(updated),
  };
}

export async function readAgentAvatarAsset(agentId: string, assetId: number) {
  const row = db.prepare("SELECT * FROM agent_avatar_assets WHERE id = ? AND agent_id = ?").get(assetId, agentId) as AvatarAssetRow | undefined;
  if (!row) throw new AgentAvatarError("avatar asset not found", 404);
  const bytes = await fs.promises.readFile(safeAssetPath(row.file_name)).catch(() => null);
  if (!bytes || bytes.length !== row.size_bytes || crypto.createHash("sha256").update(bytes).digest("hex") !== row.sha256) {
    throw new AgentAvatarError("stored avatar asset failed integrity validation", 409);
  }
  return { bytes, mimeType: row.mime_type, sha256: row.sha256 };
}

export async function importAgentAvatarImage(agentId: string, raw: any) {
  if (raw?.confirmed !== true) throw new AgentAvatarError("image import confirmation required");
  await avatarContext(agentId);
  const dataUrl = typeof raw?.image === "string" ? raw.image : "";
  if (dataUrl.length > GATEWAY_AVATAR_MAX_BYTES * 2) throw new AgentAvatarError("uploaded avatar payload is too large");
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new AgentAvatarError("avatar upload must be a PNG, JPEG, or WebP data URL");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length <= 0 || bytes.length > GATEWAY_AVATAR_MAX_BYTES) throw new AgentAvatarError("uploaded avatar must be 2 MB or smaller");
  const detected = detectImage(bytes);
  if (!detected || detected.mimeType !== match[1].toLowerCase()) throw new AgentAvatarError("uploaded avatar content does not match its declared image type");
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const agentDir = crypto.createHash("sha256").update(agentId).digest("hex").slice(0, 20);
  const fileName = `${agentDir}/upload-${sha256}.${detected.extension}`;
  const destination = safeAssetPath(fileName);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(destination, bytes, { mode: 0o600, flag: "wx" }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
    const existing = await fs.promises.readFile(destination);
    if (crypto.createHash("sha256").update(existing).digest("hex") !== sha256) throw new AgentAvatarError("Local avatar asset collision", 500);
  });
  await fs.promises.chmod(destination, 0o600);
  const prompt = "Owner-uploaded raster avatar. No image-generation prompt or provider call was used.";
  const promptHash = crypto.createHash("sha256").update(`${prompt}\0${sha256}`).digest("hex");
  db.prepare(`
    INSERT OR IGNORE INTO agent_avatar_assets (
      agent_id, file_name, mime_type, sha256, size_bytes, provider, model,
      prompt, prompt_hash, cost_state, cost_usd
    ) VALUES (?, ?, ?, ?, ?, 'owner_upload', 'browser_canvas_512', ?, ?, 'reported', 0)
  `).run(agentId, fileName, detected.mimeType, sha256, bytes.length, prompt, promptHash);
  const row = db.prepare("SELECT * FROM agent_avatar_assets WHERE agent_id = ? AND file_name = ?").get(agentId, fileName) as AvatarAssetRow | undefined;
  if (!row) throw new AgentAvatarError("Uploaded avatar was saved but its metadata could not be read", 500);
  db.prepare("INSERT INTO audit_logs (command, exit_code, duration_ms) VALUES (?, 0, 0)").run(`avatar.import:${agentId}:${row.id}`);
  return {
    ok: true,
    source: "local",
    status: "stored",
    applied: false,
    asset: publicAsset(row),
    disclosure: "The browser downscaled this owner-supplied image locally. No image-generation provider was called.",
  };
}

function isPrivateUrlHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const match = host.match(/^172\.(\d{1,3})\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function validatedHttpsUrl(value: unknown, kind: "image" | "model"): URL {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 2_048 || hasSecretShape(raw)) throw new AgentAvatarError(`valid HTTPS ${kind} URL required`);
  let url: URL;
  try { url = new URL(raw); } catch { throw new AgentAvatarError(`valid HTTPS ${kind} URL required`); }
  if (url.protocol !== "https:" || url.username || url.password || isPrivateUrlHost(url.hostname)) throw new AgentAvatarError(`public HTTPS ${kind} URL required`);
  if (kind === "model" && !url.pathname.toLowerCase().endsWith(".glb")) throw new AgentAvatarError("3D model URL must point to a .glb file");
  return url;
}

export async function applyAgentAvatarUrl(agentId: string, rawUrl: unknown, confirmed: boolean) {
  if (!confirmed) throw new AgentAvatarError("remote image review confirmation required");
  await avatarContext(agentId);
  const url = validatedHttpsUrl(rawUrl, "image");
  await gateway.updateAgent({ agentId, avatar: url.toString() });
  db.prepare("UPDATE agent_avatar_assets SET gateway_applied = 0, applied_at = NULL WHERE agent_id = ?").run(agentId);
  db.prepare("INSERT INTO audit_logs (command, exit_code, duration_ms) VALUES (?, 0, 0)").run(`avatar.apply-url:${agentId}`);
  return {
    ok: true,
    source: "gateway+owner_input",
    agentId,
    applied: true,
    kind: "https_image_url",
    host: url.hostname,
    disclosure: "Julie did not fetch or verify the remote image. Clients displaying this avatar may request it from the supplied host.",
  };
}

function safeModelPath(fileName: string): string {
  const root = path.resolve(AVATAR_MODEL_ROOT);
  const target = path.resolve(root, fileName);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new AgentAvatarError("stored 3D model path is invalid", 500);
  return target;
}

function validGlb(bytes: Buffer): boolean {
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) return false;
  let offset = 12;
  let first = true;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return false;
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + chunkLength;
    if (chunkLength < 0 || end > bytes.length) return false;
    if (first) {
      if (chunkType !== 0x4e4f534a) return false; // JSON
      try {
        const document = JSON.parse(bytes.toString("utf8", offset + 8, end).replace(/[\0\x20]+$/g, ""));
        if (document?.asset?.version !== "2.0") return false;
      } catch {
        return false;
      }
      first = false;
    }
    offset = end;
  }
  return !first && offset === bytes.length;
}

export async function importAgentAvatarModel(agentId: string, bytes: Buffer, confirmed: boolean) {
  if (!confirmed) throw new AgentAvatarError("3D model storage confirmation required");
  await avatarContext(agentId);
  if (!Buffer.isBuffer(bytes) || bytes.length <= 0 || bytes.length > LOCAL_MODEL_MAX_BYTES) throw new AgentAvatarError("GLB model must be 8 MB or smaller");
  if (!validGlb(bytes)) throw new AgentAvatarError("3D model must be a complete GLB 2.0 binary");
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const agentDir = crypto.createHash("sha256").update(agentId).digest("hex").slice(0, 20);
  const fileName = `${agentDir}/${sha256}.glb`;
  const destination = safeModelPath(fileName);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(destination, bytes, { mode: 0o600, flag: "wx" }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
    const existing = await fs.promises.readFile(destination);
    if (crypto.createHash("sha256").update(existing).digest("hex") !== sha256) throw new AgentAvatarError("Local 3D model collision", 500);
  });
  await fs.promises.chmod(destination, 0o600);
  const result = db.prepare(`
    INSERT INTO agent_avatar_models (agent_id, source_type, file_name, mime_type, sha256, size_bytes)
    VALUES (?, 'upload', ?, 'model/gltf-binary', ?, ?)
  `).run(agentId, fileName, sha256, bytes.length);
  const row = db.prepare("SELECT * FROM agent_avatar_models WHERE id = ?").get(Number(result.lastInsertRowid)) as AvatarModelRow;
  db.prepare("INSERT INTO audit_logs (command, exit_code, duration_ms) VALUES (?, 0, 0)").run(`avatar.model-import:${agentId}:${row.id}`);
  return { ok: true, source: "local", model: publicAvatarModel(row), boundary: "Stored as a Julie-only companion asset; not applied to OpenClaw identity." };
}

export async function addAgentAvatarModelUrl(agentId: string, rawUrl: unknown, confirmed: boolean) {
  if (!confirmed) throw new AgentAvatarError("3D model URL confirmation required");
  await avatarContext(agentId);
  const url = validatedHttpsUrl(rawUrl, "model");
  const result = db.prepare(`
    INSERT INTO agent_avatar_models (agent_id, source_type, source_url, mime_type)
    VALUES (?, 'https_url', ?, 'model/gltf-binary')
  `).run(agentId, url.toString());
  const row = db.prepare("SELECT * FROM agent_avatar_models WHERE id = ?").get(Number(result.lastInsertRowid)) as AvatarModelRow;
  db.prepare("INSERT INTO audit_logs (command, exit_code, duration_ms) VALUES (?, 0, 0)").run(`avatar.model-url:${agentId}:${row.id}`);
  return { ok: true, source: "owner_input", model: publicAvatarModel(row), boundary: "Reference stored without fetching. It is not a Gateway image avatar and no 3D viewer is configured." };
}

export async function readAgentAvatarModel(agentId: string, modelId: number) {
  const row = db.prepare("SELECT * FROM agent_avatar_models WHERE id = ? AND agent_id = ? AND source_type = 'upload'").get(modelId, agentId) as AvatarModelRow | undefined;
  if (!row?.file_name || !row.sha256 || !row.size_bytes) throw new AgentAvatarError("local 3D model not found", 404);
  const bytes = await fs.promises.readFile(safeModelPath(row.file_name)).catch(() => null);
  if (!bytes || bytes.length !== row.size_bytes || crypto.createHash("sha256").update(bytes).digest("hex") !== row.sha256 || !validGlb(bytes)) {
    throw new AgentAvatarError("stored 3D model failed integrity validation", 409);
  }
  return { bytes, mimeType: row.mime_type, sha256: row.sha256 };
}

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

export async function buildAgentFallbackSvg(agentId: string) {
  const context = await avatarContext(agentId);
  const initials = context.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "AI";
  const digest = crypto.createHash("sha256").update(`${agentId}\0${context.role}\0${context.personality}`).digest();
  const hue = 18 + (digest[0] % 22);
  const edgeHue = 192 + (digest[1] % 30);
  const orbit = 132 + (digest[2] % 24);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Stylized hologram fallback for ${xml(context.displayName)}">
  <defs>
    <radialGradient id="bg" cx="48%" cy="32%" r="72%"><stop offset="0" stop-color="hsl(${hue} 72% 24%)"/><stop offset=".48" stop-color="#111827"/><stop offset="1" stop-color="#050810"/></radialGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 100% 78%)" stop-opacity=".96"/><stop offset=".5" stop-color="hsl(${hue} 92% 54%)" stop-opacity=".58"/><stop offset="1" stop-color="hsl(${edgeHue} 82% 62%)" stop-opacity=".34"/></linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="frame"><rect x="16" y="16" width="480" height="480" rx="118"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="512" height="512" fill="url(#bg)"/>
    <g fill="none" stroke="hsl(${edgeHue} 80% 64%)" opacity=".18">
      <circle cx="256" cy="245" r="${orbit}"/><circle cx="256" cy="245" r="${orbit + 38}" stroke-dasharray="4 12"/><path d="M35 382 477 130M54 128l404 266"/>
    </g>
    <ellipse cx="256" cy="438" rx="128" ry="25" fill="hsl(${hue} 96% 54%)" opacity=".2" filter="url(#glow)"/>
    <path d="M162 391c13-72 43-105 94-105s81 33 94 105l-29 57H191z" fill="url(#glass)" stroke="hsl(${hue} 100% 76%)" stroke-opacity=".5"/>
    <path d="M192 196c0-62 28-102 64-102s64 40 64 102c0 54-25 101-64 101s-64-47-64-101Z" fill="url(#glass)" stroke="hsl(${hue} 100% 78%)" stroke-width="3" filter="url(#glow)"/>
    <path d="M209 210h94M221 242h70M256 98v196" fill="none" stroke="#FFF1E4" stroke-opacity=".2" stroke-width="2"/>
    <path d="m154 380 102 58 102-58M185 337l71 40 71-40" fill="none" stroke="hsl(${edgeHue} 82% 70%)" stroke-opacity=".34"/>
    <text x="256" y="223" fill="#FFF5EB" font-family="system-ui,sans-serif" font-size="68" font-weight="700" text-anchor="middle" letter-spacing="2">${xml(initials)}</text>
    <rect x="37" y="37" width="438" height="438" rx="99" fill="none" stroke="url(#glass)" stroke-width="2" opacity=".5"/>
  </g>
</svg>`;
  return { svg, etag: crypto.createHash("sha256").update(svg).digest("hex") };
}
