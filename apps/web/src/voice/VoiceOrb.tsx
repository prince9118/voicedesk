import type { AgentState } from "@livekit/components-react";
import { motion } from "motion/react";

// The orb is the call's status light. Each agent state gets a colour and a motion, and its size
// follows real audio: the assistant's voice while it speaks, the caller's microphone while it listens.
// So the animation tells the truth about what is happening, it is not decoration on a loop.

const LOOK: Partial<Record<AgentState, { from: string; to: string; label: string }>> = {
  connecting: { from: "#3b3f55", to: "#5b6080", label: "Connecting…" },
  initializing: { from: "#3b3f55", to: "#7c6cff", label: "Waking the assistant…" },
  idle: { from: "#4c4f6b", to: "#7c6cff", label: "Ready" },
  listening: { from: "#0891b2", to: "#22d3ee", label: "Listening" },
  thinking: { from: "#7c3aed", to: "#c084fc", label: "Thinking…" },
  speaking: { from: "#6d5dfc", to: "#22d3ee", label: "Speaking" },
  failed: { from: "#9f1239", to: "#fb7185", label: "Something went wrong" },
};
const FALLBACK = { from: "#2a2d3d", to: "#3b3f55", label: "Starting…" };

export function VoiceOrb({ state, volume }: { state: AgentState; volume: number }) {
  const look = LOOK[state] ?? FALLBACK;
  // Volume arrives in [0, 1]. Square-root it so quiet speech is still visible, cap the growth.
  const scale = 1 + Math.min(Math.sqrt(volume), 1) * 0.35;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative grid size-56 place-items-center">
        {/* Outer halo: breathes slowly, brightens with the voice. */}
        <motion.div
          className="absolute inset-0 rounded-full blur-3xl"
          style={{ background: `radial-gradient(circle, ${look.to}55, transparent 70%)` }}
          animate={{ scale: [1, 1.08, 1], opacity: 0.6 + Math.min(volume * 2, 0.4) }}
          transition={{ scale: { duration: 4, repeat: Infinity, ease: "easeInOut" }, opacity: { duration: 0.15 } }}
        />
        {/* Thinking: a rotating conic ring, so a pause visibly means "working", not "frozen". */}
        {state === "thinking" && (
          <motion.div
            className="absolute size-48 rounded-full"
            style={{ background: `conic-gradient(from 0deg, transparent, ${look.to}, transparent 40%)`, mask: "radial-gradient(circle, transparent 62%, #000 63%)" }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
          />
        )}
        {/* Core: colour cross-fades between states; scale follows audio with a fast spring. */}
        <motion.div
          className="size-40 rounded-full shadow-2xl"
          animate={{
            scale,
            background: `radial-gradient(circle at 30% 30%, ${look.to}, ${look.from} 70%)`,
            boxShadow: `0 0 60px ${look.to}66`,
          }}
          transition={{ scale: { type: "spring", stiffness: 300, damping: 18, mass: 0.6 }, default: { duration: 0.5 } }}
        />
      </div>
      <motion.p key={look.label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-medium text-muted" aria-live="polite">
        {look.label}
      </motion.p>
    </div>
  );
}
