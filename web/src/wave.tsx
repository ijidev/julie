/**
 * JULIE-WAVE — the single shared waveform visual (Phase D-2 Chunk B, card D2-5).
 *
 * ONE component used by the voice FAB, the Home voice orb, the voice page,
 * and the chat "AI speaking" indicator. Driven by the shared speaking store
 * (./speaking.ts): speechSynthesis onstart/onend anywhere in the app toggles
 * the `speaking` class.
 *
 * Idle   → display:none (zero bars, no animation, no layout space).
 * Speaking → bars appear and animate (steady speaking-state animation).
 */
import { useSpeaking } from "./speaking";

const DEFAULT_BARS = 12;

export function Wave({ bars = DEFAULT_BARS, className = "" }: { bars?: number; className?: string }) {
  const speaking = useSpeaking();
  const cls = ["wave", speaking ? "speaking" : "", className].filter(Boolean).join(" ");

  return (
    <div className={cls} aria-hidden="true">
      {speaking &&
        Array.from({ length: bars }).map((_, i) => (
          <span key={i} style={{ animationDelay: `${(i % 6) * 0.11}s` }} />
        ))}
    </div>
  );
}