// Shared "AI is speaking" state store (Phase D-2 Chunk B, card D2-5).
//
// One tiny external store: speechSynthesis onstart/onend anywhere in the app
// sets it, and every wave component (FAB, Home orb, voice page, chat indicator)
// renders in sync via useSpeaking(). Idle = no wave anywhere in the app.
import { useSyncExternalStore } from "react";

let speaking = false;
const listeners = new Set<() => void>();

export function setSpeaking(on: boolean): void {
  if (speaking === on) return;
  speaking = on;
  for (const l of listeners) l();
}

export function getSpeaking(): boolean {
  return speaking;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React hook: true while speechSynthesis output is active (onstart..onend). */
export function useSpeaking(): boolean {
  return useSyncExternalStore(subscribe, getSpeaking, () => false);
}

/**
 * Speak text via speechSynthesis while keeping the shared store in sync with
 * onstart/onend/onerror. Exact amplitude sync isn't feasible without a mic, so
 * the waves use a steady speaking-state animation: on at onstart, off at onend
 * — clearly distinct from idle (no waves at all).
 * Returns false when TTS is unavailable (store stays idle).
 */
export function speakWithTracking(text: string): boolean {
  if (!("speechSynthesis" in window)) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.onstart = () => setSpeaking(true);
  u.onend = () => setSpeaking(false);
  u.onerror = () => setSpeaking(false);
  window.speechSynthesis.speak(u);
  return true;
}

/** Stop any in-flight TTS and clear the shared speaking state. */
export function stopSpeaking(): void {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }
}
