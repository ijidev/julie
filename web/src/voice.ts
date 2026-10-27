/**
 * JULIE-VOICE — shared voice capture + submit logic (Phase D-2 Chunk B).
 *
 * Exports:
 *  - VoiceState: union type for voice flow states
 *  - speechSupported(): boolean — SpeechRecognition available?
 *  - startSpeechRecognition(cb): start mic capture, returns stop fn or null
 *  - submitVoiceText(text): resolve current conversation, send, return reply
 *
 * The shared speaking-state store lives in ./speaking.ts.
 */
import { api } from "./api";

// ---------------------------------------------------------------------------
// VoiceState — the lifecycle states for voice capture/processing
// ---------------------------------------------------------------------------
export type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

// ---------------------------------------------------------------------------
// SpeechRecognition support check
// ---------------------------------------------------------------------------
export function speechSupported(): boolean {
  const w = window as any;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

// ---------------------------------------------------------------------------
// SpeechRecognition wrapper
// ---------------------------------------------------------------------------
export interface SpeechRecognitionCallbacks {
  onState?: (state: "listening" | "ended" | "error") => void;
  onResult?: (text: string) => void;
  onError?: (error: string) => void;
}

/**
 * Start an inline SpeechRecognition session (no navigation, no route change).
 * Returns a stop function, or null if the browser does not support
 * SpeechRecognition (Safari / Firefox). Audio never leaves the browser
 * except through the built-in speech API.
 */
export function startSpeechRecognition(
  cb: SpeechRecognitionCallbacks
): (() => void) | null {
  if (!speechSupported()) {
    cb.onError?.("not-supported");
    cb.onState?.("error");
    return null;
  }
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  let rec: any;
  try {
    rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onstart = () => cb.onState?.("listening");
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      cb.onResult?.(text);
    };
    rec.onerror = (e: any) => {
      const err: string = e?.error ?? "unknown";
      cb.onError?.(err);
      cb.onState?.("error");
    };
    rec.onend = () => cb.onState?.("ended");
    rec.start();
  } catch (e: any) {
    cb.onError?.(e?.message || "start-failed");
    cb.onState?.("error");
    return null;
  }
  return () => {
    try {
      rec.stop();
    } catch {
      /* already stopped */
    }
  };
}

// ---------------------------------------------------------------------------
// Shared submit-into-current-conversation (Phase C.1 convId pattern)
// ---------------------------------------------------------------------------
export interface SubmitVoiceResult {
  convId: number;
  reply: string | null;
}

/**
 * Resolve the active workspace's latest conversation (create one only if none
 * exists), send the user's text, and return the assistant reply.
 *
 * This is the single shared code path used by VoicePage, VoiceFab, and any
 * other caller that needs to post voice text into the CURRENT conversation
 * without forcing navigation.
 */
export async function submitVoiceText(text: string): Promise<SubmitVoiceResult> {
  // 1. Determine active workspace
  const ws = await api.workspaces();
  const activeWsId: number = ws.activeWorkspaceId || ws.workspaces[0]?.id;
  if (!activeWsId) throw new Error("No active workspace");

  // 2. Resolve conversation: use latest existing, create only if none
  let convId: number;
  const convData = await api.conversations(activeWsId);
  if (convData.conversations.length > 0) {
    convId = convData.conversations[0].id;
  } else {
    const created = await api.createConversation(activeWsId, "Voice conversation");
    convId = created.conversation.id;
  }

  // 3. Send the message
  await api.sendMessage(convId, text);

  // 4. Fetch updated messages to get the assistant reply
  const msgs = await api.messages(convId);
  const last = msgs.messages[msgs.messages.length - 1];
  const reply = last && last.role === "assistant" ? last.text : null;

  return { convId, reply };
}