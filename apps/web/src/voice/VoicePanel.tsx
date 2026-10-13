import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useStartAudio,
  useTrackVolume,
  useTranscriptions,
  useVoiceAssistant,
} from "@livekit/components-react";
import { ConnectionState, LocalAudioTrack, MediaDeviceFailure } from "livekit-client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { api, type VoiceSession } from "../api/client";
import { MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon, RefreshIcon } from "../ui/icons";
import { Button, Card, ErrorBanner } from "../ui/primitives";
import { VoiceOrb } from "./VoiceOrb";

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
    <Card className="relative overflow-hidden">
      <AnimatePresence mode="wait">
        {phase.kind === "in-call" ? (
          <motion.div key="call" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}>
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
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-5 py-4 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
              <span className="size-1.5 rounded-full bg-success" />
              Assistant available
            </span>
            <VoiceOrb state="idle" volume={0} />
            <div>
              <h2 className="text-lg font-semibold">Talk to the assistant</h2>
              <p className="mx-auto mt-1 max-w-xs text-sm text-muted">Check a ticket, report a problem, or ask how something works.</p>
            </div>
            <Button onClick={start} busy={phase.kind === "starting"} size="lg" className="px-7">
              {phase.kind !== "starting" && <PhoneIcon />}
              {phase.kind === "starting" ? "Connecting…" : "Start call"}
            </Button>
            <p className="text-xs text-muted">Your browser will ask for microphone access.</p>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-4">
        <ErrorBanner message={error} />
      </div>
    </Card>
  );
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

  useEffect(() => {
    if (connection !== ConnectionState.Connected) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [connection]);

  // runtime narrowing (instanceof), not a type cast: only a local audio track has a volume to show
  const micTrack = microphoneTrack?.track instanceof LocalAudioTrack ? microphoneTrack.track : undefined;
  const agentVolume = useTrackVolume(audioTrack);
  const micVolume = useTrackVolume(micTrack);
  const volume = state === "speaking" ? agentVolume : state === "listening" && isMicrophoneEnabled ? micVolume : 0;

  const reconnecting = connection === ConnectionState.Reconnecting || connection === ConnectionState.SignalReconnecting;
  const recent = transcripts.slice(-6);

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex w-full items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full border border-danger/30 bg-danger/10 px-3 py-1 text-xs font-medium text-danger dark:text-rose-300">
          <motion.span className="size-1.5 rounded-full bg-current" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
          Live
        </span>
        <span className="font-mono text-sm tabular-nums text-muted" aria-label="Call duration">
          {formatDuration(seconds)}
        </span>
      </div>

      <AnimatePresence>
        {reconnecting && (
          <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-full bg-warning/15 px-3 py-1 text-xs text-amber-700 dark:text-amber-300">
            Connection interrupted, reconnecting…
          </motion.p>
        )}
      </AnimatePresence>

      <VoiceOrb state={connection === ConnectionState.Connecting ? "connecting" : state} volume={volume} />

      {/* Browsers block audio until the user interacts; offer the tap they require. */}
      {!canPlayAudio && (
        // Only onClick: the hook's props target a plain <button>, and its CSS onAnimationStart clashes with Motion's.
        <Button variant="ghost" onClick={startAudioProps.onClick}>
          Tap to enable audio
        </Button>
      )}

      <ul className="max-h-56 w-full space-y-2 overflow-y-auto" aria-live="polite" aria-label="Conversation transcript">
        <AnimatePresence initial={false}>
          {recent.map((t) => {
            const mine = t.participantInfo.identity === localParticipant.identity;
            return (
              <motion.li
                key={t.streamInfo.id}
                layout
                initial={{ opacity: 0, y: 10, x: mine ? 12 : -12 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                exit={{ opacity: 0 }}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <span
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                    mine ? "rounded-br-md bg-linear-to-br from-accent to-accent/80 text-white" : "rounded-bl-md border border-line bg-surface-strong text-fg"
                  }`}
                >
                  {t.text}
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {/* Call controls: round, icon-first, like a phone. */}
      <div className="flex items-center gap-3 pt-1">
        <ControlButton
          label={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
          active={!isMicrophoneEnabled}
          onClick={() => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        >
          {isMicrophoneEnabled ? <MicIcon /> : <MicOffIcon />}
        </ControlButton>
        <ControlButton label="Refresh tickets" onClick={onActivity}>
          <RefreshIcon />
        </ControlButton>
        <motion.button
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: 1.04 }}
          onClick={onHangUp}
          aria-label="End call"
          title="End call"
          className="grid size-14 place-items-center rounded-full bg-danger text-white shadow-lg shadow-danger/30"
        >
          <PhoneOffIcon width={22} height={22} />
        </motion.button>
      </div>
    </div>
  );
}

function ControlButton({ label, active = false, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.04 }}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`grid size-12 place-items-center rounded-full border transition-colors ${
        active ? "border-transparent bg-fg text-canvas" : "border-line bg-surface-strong text-fg"
      }`}
    >
      {children}
    </motion.button>
  );
}
