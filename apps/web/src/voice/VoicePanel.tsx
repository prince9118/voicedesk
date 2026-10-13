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
import { useState } from "react";
import { api, type VoiceSession } from "../api/client";
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
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-6 py-6 text-center">
            <VoiceOrb state="idle" volume={0} />
            <div>
              <h2 className="text-lg font-semibold">Talk to the assistant</h2>
              <p className="mt-1 max-w-xs text-sm text-muted">Check a ticket, report a problem, or ask how something works.</p>
            </div>
            <Button onClick={start} busy={phase.kind === "starting"} className="px-6">
              Start call
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-4">
        <ErrorBanner message={error} />
      </div>
    </Card>
  );
}

function InCall({ onHangUp, onActivity }: { onHangUp: () => void; onActivity: () => void }) {
  const { state, audioTrack } = useVoiceAssistant();
  const connection = useConnectionState();
  const { microphoneTrack, localParticipant } = useLocalParticipant();
  const transcripts = useTranscriptions();
  const { mergedProps: startAudioProps, canPlayAudio } = useStartAudio({ props: {} });

  // runtime narrowing (instanceof), not a type cast: only a local audio track has a volume to show
  const micTrack = microphoneTrack?.track instanceof LocalAudioTrack ? microphoneTrack.track : undefined;
  const agentVolume = useTrackVolume(audioTrack);
  const micVolume = useTrackVolume(micTrack);
  const volume = state === "speaking" ? agentVolume : state === "listening" ? micVolume : 0;

  const reconnecting = connection === ConnectionState.Reconnecting || connection === ConnectionState.SignalReconnecting;
  const recent = transcripts.slice(-6);

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <AnimatePresence>
        {reconnecting && (
          <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-full bg-amber-400/15 px-3 py-1 text-xs text-amber-300">
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

      <ul className="w-full space-y-2" aria-live="polite" aria-label="Conversation transcript">
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
                <span className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-accent/25 text-white" : "bg-surface-strong text-white/90"}`}>
                  {t.text}
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onActivity}>
          Refresh tickets
        </Button>
        <Button variant="danger" onClick={onHangUp}>
          End call
        </Button>
      </div>
    </div>
  );
}
