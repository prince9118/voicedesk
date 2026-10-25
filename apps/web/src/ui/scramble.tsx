import { useEffect, useRef, useState } from "react";

// Text that "decodes" into place: each letter cycles through random letters, then settles, left to
// right. Used for the big headline, so every state change ("listening…" → "thinking…") is visible.
//
// Accessibility and layout: the real text is always in the page (it only fades out while the effect
// runs), so screen readers and layout see the final words. The scrambling letters are a decorative
// overlay marked aria-hidden, positioned over the real text so nothing around it moves.

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const FRAME_MS = 40;

function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The text with its first `settled` characters real and the rest random. Spaces and punctuation stay.
export function scrambled(text: string, settled: number, random: () => number = Math.random): string {
  return [...text]
    .map((ch, i) => (i < settled || !/[a-z]/i.test(ch) ? ch : LETTERS[Math.floor(random() * LETTERS.length)]))
    .join("");
}

export function ScrambleText({ text, className = "", duration = 650 }: { text: string; className?: string; duration?: number }) {
  const [overlay, setOverlay] = useState<string | null>(null); // null = not animating
  const first = useRef(true);

  useEffect(() => {
    // Not on the very first paint of a reduced-motion visitor, and never for them at all.
    if (reducedMotion()) return;
    const length = [...text].length;
    const start = performance.now() + (first.current ? 250 : 0); // a short beat before the first reveal
    first.current = false;

    const id = setInterval(() => {
      const elapsed = performance.now() - start;
      if (elapsed < 0) return setOverlay(scrambled(text, 0));
      const settled = Math.floor((elapsed / duration) * length);
      if (settled >= length) {
        clearInterval(id);
        setOverlay(null);
      } else {
        setOverlay(scrambled(text, settled));
      }
    }, FRAME_MS);
    return () => {
      clearInterval(id);
      setOverlay(null);
    };
  }, [text, duration]);

  return (
    <span className={`relative inline-block ${className}`}>
      <span className={overlay === null ? "" : "opacity-0"}>{text}</span>
      {overlay !== null && (
        <span aria-hidden className="pointer-events-none absolute inset-0">
          {overlay}
        </span>
      )}
    </span>
  );
}
