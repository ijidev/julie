/**
 * JULIE-VOICE — shared voice capture + submit logic (Phase D-2 Chunk B).
 *
 * Exports:
 *  - VoiceState: union type for voice flow states
 *  - speechSupported(): boolean — SpeechRecognition available?
 *  - startSpeechRecognition(cb): start mic capture, returns stop fn or null
 *  - submitVoiceText(text): resolve an existing current conversation, send,
 *    return reply (never creates a conversation implicitly)
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

// ChatView owns this browser-local selection. Keeping only the opaque Julie DB
// id here lets the shell-mounted voice controller address the conversation the
// owner actually selected without exposing a Gateway session key.
let selectedConversationId: number | null = null;

export function setVoiceConversationId(conversationId: number | null): void {
  selectedConversationId = conversationId;
}

/**
 * Resolve the active workspace's selected conversation (or its latest existing
 * conversation when Chat has not been opened in this page load), send the
 * user's text, and return the assistant reply. Voice never creates sessions.
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

  // 2. Resolve an existing conversation. Validate the browser-local selection
  // against the real workspace response before using it.
  const convData = await api.conversations(activeWsId);
  const selected = convData.conversations.find((conversation) => conversation.id === selectedConversationId);
  const convId = selected?.id ?? convData.conversations[0]?.id;
  if (!convId) throw new Error("Create a conversation in Chat before using the microphone.");

  // 3. Send the message. The HTTP call returns as soon as the real Gateway
  // accepts the send; the assistant reply now arrives later through the
  // conversation's live event stream.
  await api.sendMessage(convId, text);

  // 4. Wait for the reply through the conversation SSE stream (same live
  // channel the chat view uses), with a bounded timeout for long agent runs.
  const reply = await awaitConversationReply(convId, 10 * 60 * 1000).catch(() => null);

  return { convId, reply };
}

/**
 * Subscribe to a conversation's event stream and resolve with the next
 * persisted assistant reply. Bounded by `timeoutMs`; the caller decides how to
 * surface a timeout (assistant reply simply has not landed yet).
 */
export function awaitConversationReply(convId: number, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const source = new EventSource(`/api/conversations/${convId}/events`);
    const finalize = (run: (value?: string) => void) => {
      clearTimeout(timer);
      source.close();
      run();
    };
    const timer = setTimeout(() => finalize(() => reject(new Error("Voice reply timed out"))), timeoutMs);
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type?: string; state?: string; message?: { role: string; text: string }; error?: string };
        if (data.type === "run" && data.state === "complete") {
          const text = data.message?.role === "assistant" ? data.message.text : "";
          if (text) finalize(() => resolve(text));
        } else if (data.type === "run" && (data.state === "error" || data.state === "aborted")) {
          finalize(() => reject(new Error(data.error || "The chat run did not produce a reply")));
        }
      } catch { /* malformed frame: keep waiting */ }
    };
    source.onerror = () => {
      // EventSource reconnects automatically; the timeout is the bound.
    };
  });
}
