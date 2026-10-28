/**
 * JULIE-VOICE-FAB — global floating voice button (Phase D-2 Chunk B, card D2-4).
 *
 * Mounted ONCE in the app shell, present on every route. Tap starts
 * SpeechRecognition inline (no navigation, no route change). The transcript is
 * posted into the CURRENT conversation through the shared submitVoiceText()
 * path (Phase C.1 convId reuse). Replies speak through the shared TTS wrapper
 * (drives the shared speaking store) and, off the /chat route, appear in a
 * compact sheet with an "Open chat" action instead of forcing navigation.
 *
 * Browser support: SpeechRecognition where available (Chrome/Edge); graceful
 * inline message where not (Safari/Firefox). No audio ever leaves the browser
 * except to built-in speech APIs.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "./markdown";
import { Wave } from "./wave";
import { speakWithTracking } from "./speaking";
import { startSpeechRecognition, submitVoiceText } from "./voice";

// Custom event name: dispatched by the AI nav button / Home orb to trigger
// the FAB's inline capture from any page (no route change).
export const VOICE_START_EVENT = "julie:voice-start";
export const VOICE_STATE_EVENT = "julie:voice-state";
// Custom event name: dispatched after a voice reply is posted; ChatView
// listens for it to refresh its message list.
const CHAT_REFRESH_EVENT = "julie:voice-message-sent";

/** Imperative trigger: call from any component (nav button, Home orb) to
 *  start inline voice capture via the global FAB. No navigation occurs. */
export function requestVoiceCapture(): void {
  window.dispatchEvent(new CustomEvent(VOICE_START_EVENT));
}

export function VoiceFab({
  route,
  onOpenChat,
  showButton = true,
}: {
  route: string;
  onOpenChat: () => void;
  showButton?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);
  const routeRef = useRef(route);
  routeRef.current = route;

  const begin = useCallback(() => {
    // Toggle: if already listening, stop
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
      setListening(false);
      return;
    }
    setError("");
    const stop = startSpeechRecognition({
      onState: (s) => {
        if (s === "listening") setListening(true);
        if (s === "error" && !busyRef.current) setError("Microphone error. Please try again.");
        if (s === "ended" && !busyRef.current) setListening(false);
      },
      onResult: (text) => {
        if (!text.trim()) return;
        busyRef.current = true;
        setListening(false);
        setProcessing(true);
        submitVoiceText(text.trim())
          .then((r) => {
            if (r.reply) {
              if (routeRef.current === "/chat") {
                // Chat page visible: signal ChatView to refresh its log
                window.dispatchEvent(new CustomEvent(CHAT_REFRESH_EVENT));
              } else {
                // Off-/chat: show compact sheet with reply + "Open chat"
                setReply(r.reply);
              }
              speakWithTracking(r.reply);
            }
          })
          .catch((e: any) => {
            setError(e?.message || "Voice send failed.");
          })
          .finally(() => {
            setProcessing(false);
            busyRef.current = false;
          });
      },
      onError: (err) => {
        if (err === "not-supported") {
          setError("Voice capture not supported in this browser. Please use Chrome or Edge.");
        }
      },
    });
    if (stop) {
      stopRef.current = stop;
    }
  }, []);

  // Listen for the global trigger event (AI nav button, Home orb)
  useEffect(() => {
    const handler = () => begin();
    window.addEventListener(VOICE_START_EVENT, handler);
    return () => window.removeEventListener(VOICE_START_EVENT, handler);
  }, [begin]);

  // Let the single visible footer control reflect the headless controller.
  useEffect(() => {
    const state = error ? "error" : processing ? "processing" : listening ? "listening" : "idle";
    window.dispatchEvent(new CustomEvent(VOICE_STATE_EVENT, { detail: { state } }));
  }, [error, listening, processing]);

  // Cleanup on unmount
  useEffect(() => () => { stopRef.current?.(); }, []);

  const cls = `voice-fab${listening ? " listening" : ""}${processing ? " processing" : ""}`;
  const showSheet = error || reply != null;

  return (
    <>
      {/* Compact reply / error sheet — appears off-/chat pages or on errors */}
      {showSheet && (
        <div className="voice-sheet">
          <div className="voice-sheet-head">
            <span>{error ? "Error" : "Julie"}</span>
            <button className="voice-sheet-close" onClick={() => { setReply(null); setError(""); }}>×</button>
          </div>
          {error && <div className="voice-sheet-body voice-sheet-error">{error}</div>}
          {reply != null && !error && (
            <div className="voice-sheet-body">
              <Markdown text={reply} />
            </div>
          )}
          {reply != null && !error && route !== "/chat" && (
            <div className="voice-sheet-actions">
              <button className="btn" onClick={() => { setReply(null); onOpenChat(); }}>
                Open chat
              </button>
            </div>
          )}
        </div>
      )}

      {/* The controller can run headlessly. Julie mounts it headless so the
          footer-center AI control is the ONE visible voice entry point. */}
      {showButton && (
        <div className="voice-fab-container">
          <Wave bars={8} className="voice-fab-wave" />
          <button
            className={cls}
            onClick={begin}
            aria-label={listening ? "Stop voice capture" : "Start voice capture"}
            title={listening ? "Listening… tap to stop" : "Tap to speak"}
          >
            {processing ? (
              <span className="voice-fab-spin" />
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v3" />
              </svg>
            )}
          </button>
        </div>
      )}
    </>
  );
}
