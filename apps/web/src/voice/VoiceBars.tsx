import type { AgentState } from "@livekit/components-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

// The call's status light, in the style of LiveKit's agent bar visualizer: a row of dots that stretch
// into bars with the real audio (the assistant's voice while it speaks, the caller's mic while it
// listens). Waiting states get a moving highlight, so a pause visibly means "working", not "frozen".

export const STATE_LABEL: Partial<Record<AgentState, string>> = {
  connecting: "Connecting",
  initializing: "Waking the assistant",
  idle: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  failed: "Something went wrong",
};

const SIZES = {
  md: { bar: 18, gap: 6, max: 76 },
  lg: { bar: 22, gap: 7, max: 96 },
};

export function VoiceBars({ state, bands, size = "lg" }: { state: AgentState; bands: number[]; size?: keyof typeof SIZES }) {
  const { bar, gap, max } = SIZES[size];
  const waiting = state === "connecting" || state === "initializing" || state === "thinking";
  const live = state === "speaking" || state === "listening";

  // One highlighted bar walks along the row while waiting: a slow sweep when connecting,
  // a quicker ripple while thinking.
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setCursor((c) => c + 1), state === "thinking" ? 140 : 260);
    return () => clearInterval(id);
  }, [waiting, state]);

  const count = bands.length;
  const sweep = cursor % (count * 2 - 2 || 1); // ping-pong across the row
  const highlighted = sweep < count ? sweep : count * 2 - 2 - sweep;

  return (
    <div className="flex items-center justify-center" style={{ gap, height: max }} aria-hidden>
      {bands.map((level, i) => {
        // Bands arrive in [0, 1] and are mostly quiet; square-root so normal speech is clearly visible.
        const boost = live ? Math.min(Math.sqrt(level) * 1.4, 1) : 0;
        const lifted = state === "thinking" && i === highlighted ? 0.28 : 0;
        const height = bar + (max - bar) * Math.max(boost, lifted);
        const color =
          state === "speaking"
            ? "bg-accent"
            : state === "failed"
              ? "bg-danger"
              : state === "listening" || (waiting && i === highlighted)
                ? "bg-fg"
                : state === "idle"
                  ? "bg-faint/70"
                  : "bg-line-strong";
        return (
          <motion.span
            key={i}
            className={`block rounded-full transition-colors duration-300 ${color}`}
            style={{ width: bar }}
            initial={false}
            animate={{ height }}
            transition={{ type: "spring", stiffness: 420, damping: 26, mass: 0.5 }}
          />
        );
      })}
    </div>
  );
}
