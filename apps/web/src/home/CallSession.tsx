import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useMultibandTrackVolume,
  useStartAudio,
  useTrackVolume,
  useTranscriptions,
  useVoiceAssistant,
} from "@livekit/components-react";
import { ConnectionState, LocalAudioTrack, MediaDeviceFailure } from "livekit-client";
import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import type { VoiceSession } from "../api/client";
import { STATE_LABEL, VoiceBars } from "../voice/VoiceBars";
import type { VoiceLevels } from "./AsciiField";
import { Composer, Headline, ToolButton } from "./Composer";

// Typed messages reach the agent on LiveKit Agents' chat topic; it answers by voice, with a transcript.
const CHAT_TOPIC = "lk.chat";

// Each failure gets a message that says what to do about it, not just that it happened.
function describeDeviceFailure(failure: MediaDeviceFailure | undefined): string {
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return "Microphone access is blocked. Allow it from the icon in your browser's address bar, or type your question instead.";
    case MediaDeviceFailure.NotFound:
      return "No microphone was found. Connect one, or type your question instead.";
    case MediaDeviceFailure.DeviceInUse:
      return "Your microphone is being used by another app. Close it and try again.";
    default:
      return "Could not start your microphone.";
  }
}

export type CallSessionProps = {
  session: VoiceSession;
  withMic: boolean;
  firstMessage: string | null;
  levels: RefObject<VoiceLevels>;
  tools: ReactNode;
  onEnd: (message?: string) => void;
  onActivity: () => void;
};

export function CallSession({ session, withMic, onEnd, ...rest }: CallSessionProps) {
  return (
    <LiveKitRoom
      serverUrl={session.serverUrl}
      token={session.participantToken}
      connect
      audio={withMic}
      video={false}
      onDisconnected={() => onEnd()}
      onError={(err) => onEnd(`The call failed: ${err.message}`)}
      onMediaDeviceFailure={(failure) => onEnd(describeDeviceFailure(failure))}
    >
      <InCall onEnd={onEnd} {...rest} />
      {/* Plays the assistant's audio. Without it you connect and hear nothing. */}
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

type Line = { id: string; mine: boolean; text: string; at: number };

function InCall({ firstMessage, levels, tools, onEnd, onActivity }: Omit<CallSessionProps, "session" | "withMic">) {
  const { state, audioTrack } = useVoiceAssistant();
  const connection = useConnectionState();
  const { microphoneTrack, localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const transcripts = useTranscriptions();
  const { mergedProps: startAudioProps, canPlayAudio } = useStartAudio({ props: {} });
  const [seconds, setSeconds] = useState(0);
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<Line[]>([]);
  const queued = useRef<string | null>(firstMessage);
  const transcriptEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (connection !== ConnectionState.Connected) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [connection]);

  // runtime narrowing (instanceof), not a type cast: only a local audio track has levels to show
  const micTrack = microphoneTrack?.track instanceof LocalAudioTrack ? microphoneTrack.track : undefined;
  const agentVolume = useTrackVolume(audioTrack);
  const micVolume = useTrackVolume(micTrack);
  const agentBands = useMultibandTrackVolume(audioTrack, { bands: 5 });
  const micBands = useMultibandTrackVolume(micTrack, { bands: 5 });
  const listening = state === "listening" && isMicrophoneEnabled;

  // Feed the backdrop: the assistant's voice lights the upper hand, the caller's the lower one.
  useEffect(() => {
    levels.current = { agent: state === "speaking" ? agentVolume : 0, user: listening ? micVolume : 0 };
  }, [levels, state, agentVolume, micVolume, listening]);
  useEffect(() => () => void (levels.current = { agent: 0, user: 0 }), [levels]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSent((lines) => [...lines, { id: `me-${Date.now()}`, mine: true, text: trimmed, at: Date.now() }]);
    await localParticipant.sendText(trimmed, { topic: CHAT_TOPIC });
    onActivity();
  }

  // A question typed before the call existed goes out once the assistant is ready to listen.
  useEffect(() => {
    if (queued.current && state === "listening") {
      const text = queued.current;
      queued.current = null;
      void send(text);
    }
  }, [state]);

  // One timeline: spoken lines (both sides) plus what the caller typed, oldest first.
  const lines: Line[] = [
    ...transcripts
      .filter((t) => t.text.trim())
      .map((t) => ({ id: t.streamInfo.id, mine: t.participantInfo.identity === localParticipant.identity, text: t.text, at: t.streamInfo.timestamp })),
    ...sent,
  ].sort((a, b) => a.at - b.at);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length, transcripts]);

  const reconnecting = connection === ConnectionState.Reconnecting || connection === ConnectionState.SignalReconnecting;
  const shown = connection === ConnectionState.Connecting ? "connecting" : state;
  const label = reconnecting ? "reconnecting" : (STATE_LABEL[shown] ?? "starting").toLowerCase();

  return (
    <>
      {/* The conversation grows upward from the headline, over the art. Its height is capped to the space
          above the headline, so a long conversation scrolls inside the panel instead of covering the header. */}
      <AnimatePresence>
        {lines.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-panel absolute inset-x-0 bottom-full mb-8 max-h-[max(8rem,calc(50svh-13rem))] overflow-y-auto rounded-2xl bg-surface/95 px-5 py-4"
            aria-live="polite"
            aria-label="Conversation"
          >
            <ul className="space-y-3">
              {lines.map((line) => (
                <motion.li key={line.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={line.mine ? "flex justify-end" : ""}>
                  {line.mine ? (
                    <span className="max-w-[85%] rounded-2xl rounded-br-md bg-wash px-3.5 py-2 text-sm">{line.text}</span>
                  ) : (
                    <p className="max-w-[94%] text-[15px] leading-relaxed font-light">{line.text}</p>
                  )}
                </motion.li>
              ))}
            </ul>
            <div ref={transcriptEnd} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Each state change decodes into place, so a pause visibly means "thinking", not "frozen". */}
      <div className="mb-8">
        <Headline>{`${label}…`}</Headline>
      </div>

      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={() => {
          void send(draft);
          setDraft("");
        }}
        placeholder={isMicrophoneEnabled ? "Speak, or type a message…" : "Type a message…"}
        autoFocus={!isMicrophoneEnabled}
        tools={
          <>
            {tools}
            <ToolButton
              label={isMicrophoneEnabled ? "Mute microphone" : "Turn on microphone"}
              aria-pressed={isMicrophoneEnabled}
              active={isMicrophoneEnabled}
              onClick={() => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
            >
              {isMicrophoneEnabled ? <Mic size={17} strokeWidth={1.7} /> : <MicOff size={17} strokeWidth={1.7} />}
            </ToolButton>
            {/* Browsers block audio until the user interacts; offer the tap they require. */}
            {!canPlayAudio && (
              <ToolButton label="Enable audio" onClick={startAudioProps.onClick}>
                <Volume2 size={17} strokeWidth={1.7} />
              </ToolButton>
            )}
            <ToolButton label="End call" tone="danger" onClick={() => onEnd()}>
              <PhoneOff size={16} strokeWidth={1.8} />
            </ToolButton>
          </>
        }
        status={
          <span className="flex items-center gap-2.5 font-mono text-[11px] text-muted" aria-label={`Live call, ${formatDuration(seconds)}`}>
            <VoiceBars state={shown} bands={state === "speaking" ? agentBands : listening ? micBands : [0, 0, 0, 0, 0]} size="sm" />
            <span className="tabular-nums">{formatDuration(seconds)}</span>
          </span>
        }
      />
    </>
  );
}
