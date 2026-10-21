import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useMultibandTrackVolume,
  useStartAudio,
  useTranscriptions,
  useVoiceAssistant,
} from "@livekit/components-react";
import { ConnectionState, LocalAudioTrack, MediaDeviceFailure } from "livekit-client";
import { Mic, MicOff, Phone, PhoneOff, RefreshCw, Volume2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api, type VoiceSession } from "../api/client";
import { Button, Card, ErrorBanner, Tip } from "../ui/primitives";
import { STATE_LABEL, VoiceBars } from "./VoiceBars";

const BANDS = 5;
const SILENT = Array<number>(BANDS).fill(0);

// Each failure gets a message that says what to do about it, not just that it happened.
function describeDeviceFailure(failure: MediaDeviceFailure | undefined): string {
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return "Microphone access is blocked. Allow it from the icon in your browser's address bar, then start the call again.";
    case MediaDeviceFailure.NotFound:
      return "No microphone was found. Connect one and try again.";
    case MediaDeviceFailure.DeviceInUse:
      return "Your microphone is being used by another app. Close it and try again.";
    default:
      return "Could not start your microphone.";
  }
}

type Phase = { kind: "idle" } | { kind: "starting" } | { kind: "in-call"; session: VoiceSession };

export function VoicePanel({ onCallActivity }: { onCallActivity: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setPhase({ kind: "starting" });
    try {
      setPhase({ kind: "in-call", session: await api.startVoiceSession() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the call.");
      setPhase({ kind: "idle" });
    }
  }

  function end(message: string | null = null) {
    setPhase({ kind: "idle" });
    setError(message);
    onCallActivity(); // the assistant may have created a ticket: refresh the list
  }

  return (
    <Card className="overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        {phase.kind === "in-call" ? (
          <motion.div key="call" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <LiveKitRoom
              serverUrl={phase.session.serverUrl}
              token={phase.session.participantToken}
              connect
              audio
              video={false}
              onDisconnected={() => end()}
              onError={(err) => end(`The call failed: ${err.message}`)}
              onMediaDeviceFailure={(failure) => end(describeDeviceFailure(failure))}
            >
              <InCall onHangUp={() => end()} onActivity={onCallActivity} />
              {/* Plays the assistant's audio. Without it you would connect and hear nothing. */}
              <RoomAudioRenderer />
            </LiveKitRoom>
          </motion.div>
        ) : (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <PanelHeader>
              <span className="flex items-center gap-2 text-[13px] text-muted">
                <span className="size-1.5 rounded-full bg-success" />
                Assistant available
              </span>
            </PanelHeader>
            <div className="flex flex-col items-center px-6 pt-10 pb-6 text-center">
              <VoiceBars state="idle" bands={SILENT} />
              <h2 className="mt-8 text-lg font-semibold tracking-tight">Talk to support</h2>
              <p className="mt-1 max-w-68 text-sm text-muted">Check on a ticket, report a problem, or ask how something works.</p>
              <Button onClick={start} busy={phase.kind === "starting"} size="lg" className="mt-6 w-full">
                {phase.kind !== "starting" && <Phone size={16} />}
                {phase.kind === "starting" ? "Connecting…" : "Start a call"}
              </Button>
              <p className="mt-3 text-xs text-faint">Your browser will ask for microphone access.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {error && (
        <div className="px-4 pb-4">
          <ErrorBanner message={error} />
        </div>
      )}
    </Card>
  );
}

function PanelHeader({ children }: { children: React.ReactNode }) {
  return <div className="flex h-12 items-center justify-between border-b border-line px-4">{children}</div>;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function InCall({ onHangUp, onActivity }: { onHangUp: () => void; onActivity: () => void }) {
  const { state, audioTrack } = useVoiceAssistant();
  const connection = useConnectionState();
  const { microphoneTrack, localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const transcripts = useTranscriptions();
  const { mergedProps: startAudioProps, canPlayAudio } = useStartAudio({ props: {} });
  const [seconds, setSeconds] = useState(0);
  const transcriptEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (connection !== ConnectionState.Connected) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [connection]);

  // Keep the newest line in view as the conversation grows.
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "nearest" });
  }, [transcripts]);

  // runtime narrowing (instanceof), not a type cast: only a local audio track has levels to show
  const micTrack = microphoneTrack?.track instanceof LocalAudioTrack ? microphoneTrack.track : undefined;
  const agentBands = useMultibandTrackVolume(audioTrack, { bands: BANDS });
  const micBands = useMultibandTrackVolume(micTrack, { bands: BANDS });
  const bands = state === "speaking" ? agentBands : state === "listening" && isMicrophoneEnabled ? micBands : SILENT;

  const reconnecting = connection === ConnectionState.Reconnecting || connection === ConnectionState.SignalReconnecting;
  const shownState = connection === ConnectionState.Connecting ? "connecting" : state;

  return (
    <div className="flex flex-col">
      <PanelHeader>
        <span className="flex items-center gap-2 text-[13px] font-medium">
          <motion.span className="size-1.5 rounded-full bg-danger" animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />
          Live call
        </span>
        <span className="font-mono text-xs text-muted tabular-nums" aria-label="Call duration">
          {formatDuration(seconds)}
        </span>
      </PanelHeader>

      <div className="flex flex-col items-center gap-5 px-6 pt-8 pb-5">
        <VoiceBars state={shownState} bands={bands} />
        <p className="text-sm text-muted" aria-live="polite">
          {reconnecting ? "Connection interrupted, reconnecting…" : (STATE_LABEL[shownState] ?? "Starting")}
        </p>
        {/* Browsers block audio until the user interacts; offer the tap they require. */}
        {!canPlayAudio && (
          <Button variant="secondary" size="sm" onClick={startAudioProps.onClick}>
            <Volume2 size={15} />
            Tap to enable audio
          </Button>
        )}
      </div>

      {/* Transcript, chat-style: your words in a bubble on the right, the assistant's as plain text. */}
      <div className="max-h-72 min-h-24 overflow-y-auto border-t border-line bg-subtle px-4 py-4" aria-live="polite" aria-label="Conversation transcript">
        {transcripts.length === 0 ? (
          <p className="py-4 text-center text-xs text-faint">The conversation will appear here.</p>
        ) : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {transcripts.map((t) => {
                const mine = t.participantInfo.identity === localParticipant.identity;
                return (
                  <motion.li
                    key={t.streamInfo.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={mine ? "flex justify-end" : ""}
                  >
                    {mine ? (
                      <span className="max-w-[85%] rounded-2xl rounded-br-md bg-wash px-3.5 py-2 text-sm">{t.text}</span>
                    ) : (
                      <p className="max-w-[92%] text-sm leading-relaxed">{t.text}</p>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
        <div ref={transcriptEnd} />
      </div>

      {/* Control bar: secondary actions on the left, hang up on the right, like a call app. */}
      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        <Tip label={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}>
          <Button
            variant={isMicrophoneEnabled ? "secondary" : "primary"}
            size="icon"
            aria-label={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
            aria-pressed={!isMicrophoneEnabled}
            onClick={() => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
          >
            {isMicrophoneEnabled ? <Mic size={16} /> : <MicOff size={16} />}
          </Button>
        </Tip>
        <Tip label="Refresh tickets">
          <Button variant="secondary" size="icon" aria-label="Refresh tickets" onClick={onActivity}>
            <RefreshCw size={15} />
          </Button>
        </Tip>
        <Button variant="danger" onClick={onHangUp} className="ml-auto">
          <PhoneOff size={15} />
          End call
        </Button>
      </div>
    </div>
  );
}
