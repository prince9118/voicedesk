import { type RefObject, useEffect, useRef } from "react";
import { ADAM, GOD, type HandSprite } from "./hands-data";

// The living backdrop: graph paper, drifting dust, and the two hands from the "Creation of Adam"
// drawn as ASCII cells, reaching for each other across the headline and the composer.
//
// It is one <canvas> redrawn each frame (about 1,500 cells), never React state, so it costs nothing
// in renders. During a call it listens to `levels` (a ref the call writes into): the assistant's
// voice lights up the upper hand, the caller's microphone the lower one.

export type VoiceLevels = { agent: number; user: number };

const RAMP = "@#8%$XSst:o'"; // dark → light
const NOISE = "@#8%$XSst:o'+*x=?";
const DUST = "--------.'·";

type Cell = {
  x: number;
  y: number;
  hand: 0 | 1; // 0 = upper (assistant), 1 = lower (caller)
  lum: number;
  cover: number;
  rgb: [number, number, number];
  ch: string;
  flow: number; // 0 at the arm's base … 1 at the fingertip
  delay: number; // ms before it decodes in
  scrambleUntil: number;
  scrambled: boolean; // showing noise right now (restore the real glyph when it ends)
};
type Dust = { x: number; y: number; ch: string; alpha: number; speed: number; phase: number };
type Palette = { dark: boolean; grid: string; ink: string; inkSoft: string; accent: [number, number, number] };

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = (s: string) => s[rand(s.length)]!;
const glyphFor = (lum: number) => {
  const i = Math.min(RAMP.length - 1, Math.max(0, Math.floor((lum / 256) * RAMP.length) + rand(3) - 1));
  return RAMP[i]!;
};

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.trim().replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const dark = document.documentElement.dataset.theme === "dark";
  return {
    dark,
    grid: dark ? "rgba(255,255,255,0.045)" : "rgba(20,20,10,0.05)",
    ink: css.getPropertyValue("--fg").trim() || "#21201c",
    inkSoft: css.getPropertyValue("--faint").trim() || "#8d8d86",
    accent: hexToRgb(css.getPropertyValue("--accent") || "#f76b15"),
  };
}

// Cheap smooth 2D noise for clustering the dust (value noise on a coarse lattice).
function makeNoise() {
  const seed = new Map<string, number>();
  const at = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (!seed.has(k)) seed.set(k, Math.random());
    return seed.get(k)!;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const sx = smooth(x - x0), sy = smooth(y - y0);
    const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
    const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };
}

export function AsciiField({
  anchorRef,
  levels,
  className = "",
}: {
  anchorRef: RefObject<HTMLElement | null>;
  levels?: RefObject<VoiceLevels>;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0, H = 0, C = 12, dpr = 1;
    let cells: Cell[] = [];
    let dust: Dust[] = [];
    let palette = readPalette();
    let grid: HTMLCanvasElement | null = null;
    let start = performance.now();
    let pointer: { x: number; y: number } | null = null;
    let visible = true;
    let frame = 0;

    function place(sprite: HandSprite, hand: 0 | 1, tipX: number, tipY: number) {
      const col0 = Math.round(tipX / C) - sprite.tip[0];
      const row0 = Math.round(tipY / C) - sprite.tip[1];
      const maxDist = Math.hypot(sprite.cols, sprite.rows);
      for (const [c, r, cover, lum, red, green, blue] of sprite.cells) {
        const x = (col0 + c) * C, y = (row0 + r) * C;
        if (x < -C || y < -C || x > W || y > H) continue;
        const flow = 1 - Math.min(1, Math.hypot(c - sprite.tip[0], r - sprite.tip[1]) / (maxDist * 0.75));
        cells.push({
          x, y, hand, lum, cover,
          rgb: [red, green, blue],
          ch: glyphFor(lum),
          flow,
          delay: (1 - flow) * 300 + flow * 1300 + Math.random() * 260,
          scrambleUntil: 0,
          scrambled: true,
        });
      }
    }

    function layout() {
      const rect = canvas!.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      dpr = Math.min(devicePixelRatio || 1, 2);
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      C = W < 640 ? 9 : Math.max(10, Math.min(13, Math.round(H / 72)));
      palette = readPalette();

      // Graph paper, drawn once.
      grid = document.createElement("canvas");
      grid.width = canvas!.width;
      grid.height = canvas!.height;
      const g = grid.getContext("2d")!;
      g.scale(dpr, dpr);
      g.strokeStyle = palette.grid;
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 0.5; x < W; x += C) (g.moveTo(x, 0), g.lineTo(x, H));
      for (let y = 0.5; y < H; y += C) (g.moveTo(0, y), g.lineTo(W, y));
      g.stroke();

      // Fingertips aim at the centre block: one just above it, one just below its left side.
      const anchor = anchorRef.current?.getBoundingClientRect();
      const a = anchor
        ? { left: anchor.left - rect.left, top: anchor.top - rect.top, width: anchor.width, bottom: anchor.bottom - rect.top }
        : { left: W * 0.3, top: H * 0.4, width: W * 0.4, bottom: H * 0.6 };
      cells = [];
      place(GOD, 0, a.left + a.width * 0.47, a.top - C * 4);
      place(ADAM, 1, a.left + a.width * 0.08, a.bottom + C * 1.5);

      // Dust: clustered by noise, kept away from the centre column so text stays clean.
      const noise = makeNoise();
      const taken = new Set(cells.map((c) => `${c.x},${c.y}`));
      dust = [];
      for (let y = 0; y < H; y += C) {
        for (let x = 0; x < W; x += C) {
          if (taken.has(`${x},${y}`)) continue;
          const nearCentre = x > a.left - C * 2 && x < a.left + a.width + C * 2 && y > a.top - C * 6 && y < a.bottom + C * 2;
          if (nearCentre) continue;
          const density = Math.max(0, noise(x / (C * 9), y / (C * 9)) - 0.55) * 0.5;
          if (Math.random() < density) {
            dust.push({ x, y, ch: pick(DUST), alpha: 0.25 + Math.random() * 0.45, speed: 0.4 + Math.random() * 1.4, phase: Math.random() * 6.28 });
          }
        }
      }
    }

    function draw(now: number) {
      const t = reduceMotion ? Infinity : now - start;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, W, H);
      if (grid) ctx!.drawImage(grid, 0, 0, W, H);

      ctx!.font = `${Math.round(C * 0.82)}px "Geist Mono Variable", ui-monospace, monospace`;
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";
      const secs = reduceMotion ? 0 : now / 1000;

      // Dust twinkles slowly.
      ctx!.fillStyle = palette.inkSoft;
      for (const d of dust) {
        ctx!.globalAlpha = reduceMotion ? d.alpha : d.alpha * (0.55 + 0.45 * Math.sin(secs * d.speed + d.phase));
        ctx!.fillText(d.ch, d.x + C / 2, d.y + C / 2 + 0.5);
      }

      const agent = Math.min(1, (levels?.current?.agent ?? 0) * 1.8);
      const user = Math.min(1, (levels?.current?.user ?? 0) * 1.8);
      const scrambleRate = reduceMotion ? 0 : 0.0016 + (agent + user) * 0.01;
      const [ar, ag, ab] = palette.accent;

      for (const cell of cells) {
        if (t < cell.delay) continue;
        const age = t - cell.delay;
        const decoding = age < 380;

        let near = 0;
        if (pointer && !reduceMotion) {
          const d = Math.hypot(cell.x + C / 2 - pointer.x, cell.y + C / 2 - pointer.y);
          near = Math.max(0, 1 - d / (C * 7));
        }
        if (!decoding && (Math.random() < scrambleRate || Math.random() < near * 0.08)) {
          cell.scrambleUntil = t + 120 + Math.random() * 260;
        }
        const scrambling = decoding || t < cell.scrambleUntil;
        if (scrambling) cell.ch = pick(NOISE);
        else if (cell.scrambled) cell.ch = glyphFor(cell.lum);
        cell.scrambled = scrambling;

        // Voice: a pulse travels along the arm toward the fingertip, brighter with louder speech.
        const level = cell.hand === 0 ? agent : user;
        const wave = reduceMotion ? 0 : Math.max(0, Math.sin(cell.flow * 9 - secs * (3 + level * 6)));
        const glow = Math.min(1, level * wave * (0.35 + 0.65 * cell.flow) * 1.4 + near * 0.25);

        const fade = decoding ? age / 380 : 1;
        const darkness = 1 - cell.lum / 255; // 0 light … 1 dark
        const solid = cell.cover >= 0.5;

        if (solid) {
          // Fill: the fresco's colour, muted toward grey, shaded by brightness; accent mixes in with voice.
          const grey = palette.dark ? 255 - cell.lum * 0.55 : cell.lum * 0.92;
          let [r, g, b] = cell.rgb.map((v) => grey * 0.72 + (palette.dark ? 255 - v * 0.55 : v * 0.92) * 0.28) as [number, number, number];
          r += (ar - r) * glow;
          g += (ag - g) * glow;
          b += (ab - b) * glow;
          const alpha = (palette.dark ? 0.1 + darkness * 0.5 : 0.12 + darkness * 0.8) * fade;
          ctx!.globalAlpha = Math.min(1, alpha + glow * 0.4);
          ctx!.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
          ctx!.fillRect(cell.x + 1, cell.y + 1, C - 1, C - 1);
        }

        // Glyph: light on dark cells, dark on light ones.
        const onDark = palette.dark ? darkness < 0.45 : darkness > 0.55;
        ctx!.globalAlpha = (solid ? 0.95 : 0.45) * fade;
        ctx!.fillStyle = glow > 0.35 ? "#fff" : onDark ? (palette.dark ? "#111110" : "#f7f6f2") : palette.ink;
        ctx!.fillText(cell.ch, cell.x + C / 2, cell.y + C / 2 + 0.5);
      }
      ctx!.globalAlpha = 1;
    }

    function loop(now: number) {
      if (visible) draw(now);
      frame = requestAnimationFrame(loop);
    }

    layout();
    if (reduceMotion) draw(performance.now());
    else frame = requestAnimationFrame(loop);

    const relayout = () => {
      layout();
      // Later re-layouts (resize, theme) re-place the cells without replaying the intro.
      const now = performance.now();
      if (now - start > 2500) start = now - 5000;
      if (reduceMotion) draw(performance.now());
    };
    const resize = new ResizeObserver(relayout);
    resize.observe(canvas);
    if (anchorRef.current) resize.observe(anchorRef.current);
    // Theme switches change every colour: rebuild the palette and the grid.
    const themeWatch = new MutationObserver(relayout);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const io = new IntersectionObserver(([entry]) => (visible = entry?.isIntersecting ?? true));
    io.observe(canvas);
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => (pointer = null);
    addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      themeWatch.disconnect();
      io.disconnect();
      removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [anchorRef, levels]);

  return <canvas ref={canvasRef} aria-hidden className={`pointer-events-none absolute inset-0 size-full ${className}`} />;
}
