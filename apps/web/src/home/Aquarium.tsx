import { type RefObject, useEffect, useRef } from "react";

// The living backdrop: koi made of small square "pixels" swim slowly across a clean page, with faint
// dust at the edges.
//
// Each frame the koi are drawn smoothly into a tiny offscreen canvas (one pixel per mosaic cell),
// then every lit pixel is painted as a square on the real canvas. One <canvas>, never React state,
// so it costs nothing in renders. During a call the fish speed up and warm toward the accent colour
// while the assistant speaks, and wag harder when the caller's microphone is loud.

export type VoiceLevels = { agent: number; user: number };

type RGB = [number, number, number];
type Koi = {
  seg: { x: number; y: number }[]; // spine, head first
  angle: number;
  len: number;
  speed: number; // px per second
  phase: number;
  seed: number;
  base: RGB;
  patch: RGB;
};
type Dust = { x: number; y: number; a: number; speed: number; phase: number };
type Palette = { dark: boolean; accent: RGB; fg: RGB };

const SEGMENTS = 20;
// Muted, fresco-like tones: slate, graphite, sand, pale grey.
const TONES: RGB[] = [
  [104, 114, 146],
  [88, 88, 96],
  [156, 128, 92],
  [168, 168, 176],
  [124, 132, 160],
];

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function hexToRgb(hex: string): RGB {
  const v = parseInt(hex.trim().replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  return {
    dark: document.documentElement.dataset.theme === "dark",
    accent: hexToRgb(style.getPropertyValue("--accent") || "#f76b15"),
    fg: hexToRgb(style.getPropertyValue("--fg") || "#21201c"),
  };
}

// Body thickness along the spine: blunt head, widest just behind it, thin tail root.
const thickness = (t: number) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.82)), 0.85) * (1 - 0.15 * t);

export function Aquarium({
  anchorRef,
  levels,
  className = "",
}: {
  /** The block the fish swim behind; they fade back where they cross it so text stays readable. */
  anchorRef?: RefObject<HTMLElement | null>;
  levels?: RefObject<VoiceLevels>;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const low = document.createElement("canvas");
    const lctx = low.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx || !lctx) return;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0, H = 0, C = 10, dpr = 1, cols = 0, rows = 0;
    let koi: Koi[] = [];
    let dust: Dust[] = [];
    let palette = readPalette();
    let visible = true;
    let frame = 0;
    let last = performance.now();
    let clock = 0;
    let voice = 0;
    let user = 0;
    let pointer: { x: number; y: number } | null = null;

    function layout() {
      const rect = canvas!.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      dpr = Math.min(devicePixelRatio || 1, 2);
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      C = W < 640 ? 8 : 10;
      cols = Math.ceil(W / C);
      rows = Math.ceil(H / C);
      low.width = cols;
      low.height = rows;
      palette = readPalette();

      const small = W < 640;
      const count = small ? 3 : 4;
      const unit = Math.min(W, H);
      koi = Array.from({ length: count }, (_, i) => {
        const len = unit * (small ? rand(0.5, 0.66) : rand(0.36, 0.5));
        const angle = rand(0, Math.PI * 2);
        const hx = rand(W * 0.1, W * 0.9), hy = rand(H * 0.1, H * 0.9);
        const segLen = len / SEGMENTS;
        return {
          seg: Array.from({ length: SEGMENTS }, (_, k) => ({ x: hx - Math.cos(angle) * segLen * k, y: hy - Math.sin(angle) * segLen * k })),
          angle,
          len,
          speed: len * rand(0.16, 0.26),
          phase: rand(0, 6.28),
          seed: rand(0, 100),
          base: TONES[i % TONES.length]!,
          patch: TONES[(i + 2) % TONES.length]!,
        };
      });

      // Dust: sparse dots, denser toward the edges and in loose clusters, clear of the centre.
      dust = [];
      for (let y = 0; y < H; y += C) {
        for (let x = 0; x < W; x += C) {
          const dx = (x / W - 0.5) * 2, dy = (y / H - 0.5) * 2;
          const d = clamp(Math.hypot(dx, dy) / 1.2, 0, 1);
          const cluster = 0.5 + 0.5 * Math.sin(x * 0.011 + 1.3) * Math.sin(y * 0.014 + 0.4);
          if (Math.random() < 0.22 * Math.pow(d, 2.4) * cluster) {
            dust.push({ x, y, a: rand(0.14, 0.4), speed: rand(0.4, 1.3), phase: rand(0, 6.28) });
          }
        }
      }
    }

    function stepKoi(k: Koi, dt: number) {
      const head = k.seg[0]!;
      // Wander: a slow weave, steered back toward the page when well outside it, and away from the pointer.
      let turn = Math.sin(clock * 0.3 + k.phase) * 0.45 + Math.sin(clock * 0.13 + k.seed) * 0.3;
      const m = k.len * 0.7;
      if (head.x < -m || head.x > W + m || head.y < -m || head.y > H + m) {
        const want = Math.atan2(H / 2 - head.y, W / 2 - head.x);
        const diff = Math.atan2(Math.sin(want - k.angle), Math.cos(want - k.angle));
        turn += clamp(diff, -1, 1) * 2.2;
      }
      if (pointer) {
        const dx = head.x - pointer.x, dy = head.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < 170) {
          const away = Math.atan2(dy, dx);
          const diff = Math.atan2(Math.sin(away - k.angle), Math.cos(away - k.angle));
          turn += clamp(diff, -1, 1) * (1 - d / 170) * 2.5;
        }
      }
      k.angle += turn * dt;
      const v = k.speed * (1 + voice * 1.6);
      head.x += Math.cos(k.angle) * v * dt;
      head.y += Math.sin(k.angle) * v * dt;
      const segLen = k.len / SEGMENTS;
      for (let i = 1; i < k.seg.length; i++) {
        const p = k.seg[i - 1]!, s = k.seg[i]!;
        const dx = s.x - p.x, dy = s.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        s.x = p.x + (dx / d) * segLen;
        s.y = p.y + (dy / d) * segLen;
      }
    }

    // Draw one koi, smoothly, in page pixels, onto the low-res canvas.
    function paintKoi(k: Koi, tint: number) {
      const n = k.seg.length;
      const wagAmp = k.len * (0.035 + user * 0.03);
      const maxR = k.len * 0.085;
      const wag = (i: number) => Math.sin(clock * 3.2 - i * 0.42 + k.phase) * wagAmp * Math.pow(i / n, 1.4);
      const lift = (c: RGB) => {
        let out = palette.dark ? mix(c, [255, 255, 255], 0.5) : c;
        out = mix(out, palette.accent, tint);
        return out;
      };
      // Spine with the swimming wave applied sideways.
      const pts = k.seg.map((s, i) => {
        const prev = k.seg[Math.max(0, i - 1)]!, next = k.seg[Math.min(n - 1, i + 1)]!;
        const a = Math.atan2(next.y - prev.y, next.x - prev.x) + Math.PI / 2;
        const w = wag(i);
        return { x: s.x + Math.cos(a) * w, y: s.y + Math.sin(a) * w, a };
      });

      // Tail fin: a translucent fan beyond the last spine point.
      const tail = pts[n - 1]!, before = pts[n - 3]!;
      const ta = Math.atan2(tail.y - before.y, tail.x - before.x);
      const finLen = k.len * 0.22;
      const finSpread = k.len * 0.13;
      const sway = Math.sin(clock * 3.2 - n * 0.42 + k.phase + 0.8) * 0.35;
      lctx!.fillStyle = css(lift(mix(k.base, [255, 255, 255], palette.dark ? 0.1 : 0.45)));
      lctx!.globalAlpha = 0.7;
      for (const side of [-1, 1]) {
        const ea = ta + side * 0.5 + sway;
        lctx!.beginPath();
        lctx!.moveTo(tail.x, tail.y);
        lctx!.quadraticCurveTo(tail.x + Math.cos(ta + side * 0.15) * finLen * 0.6, tail.y + Math.sin(ta + side * 0.15) * finLen * 0.6, tail.x + Math.cos(ea) * finLen, tail.y + Math.sin(ea) * finLen);
        lctx!.quadraticCurveTo(tail.x + Math.cos(ta) * finLen * 0.55, tail.y + Math.sin(ta) * finLen * 0.55, tail.x, tail.y);
        lctx!.fill();
      }
      void finSpread;

      // Pectoral fins, just behind the head, flapping gently.
      const fp = pts[3]!;
      for (const side of [-1, 1]) {
        const flap = Math.sin(clock * 2.4 + k.phase + side) * 0.25;
        const fa = fp.a + (side === 1 ? 0 : Math.PI) + (side === 1 ? 1 : -1) * 0.5 + flap;
        lctx!.beginPath();
        lctx!.ellipse(fp.x + Math.cos(fa) * maxR * 1.2, fp.y + Math.sin(fa) * maxR * 1.2, maxR * 0.95, maxR * 0.3, fa + 0.4 * side, 0, Math.PI * 2);
        lctx!.fill();
      }

      // Body: overlapping discs along the spine, patched with a second tone.
      lctx!.globalAlpha = 1;
      const steps = n * 3;
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const f = t * (n - 1);
        const i = Math.min(n - 2, Math.floor(f));
        const u = f - i;
        const a = pts[i]!, b = pts[i + 1]!;
        const patch = Math.sin(t * 9 + k.seed) + Math.sin(t * 4.1 + k.seed * 2) > 0.7;
        const shade = 0.85 + 0.15 * Math.sin(t * 20 + k.seed); // faint scale-like banding
        const c = mix(patch ? k.patch : k.base, [0, 0, 0], 1 - shade);
        lctx!.fillStyle = css(lift(c));
        lctx!.beginPath();
        lctx!.arc(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, Math.max(0.8, maxR * thickness(t)), 0, Math.PI * 2);
        lctx!.fill();
      }
    }

    function draw(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const agent = clamp((levels?.current?.agent ?? 0) * 1.8, 0, 1);
      voice += (agent - voice) * Math.min(1, dt * 6);
      user += (clamp((levels?.current?.user ?? 0) * 1.8, 0, 1) - user) * Math.min(1, dt * 6);
      if (!reduceMotion) {
        clock += dt;
        for (const k of koi) stepKoi(k, dt);
      }

      lctx!.setTransform(1, 0, 0, 1, 0, 0);
      lctx!.clearRect(0, 0, cols, rows);
      lctx!.setTransform(1 / C, 0, 0, 1 / C, 0, 0);
      koi.forEach((k, i) => paintKoi(k, voice * (i === 0 ? 0.85 : 0.45)));
      lctx!.globalAlpha = 1;
      const px = lctx!.getImageData(0, 0, cols, rows).data;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, W, H);

      // Dust twinkles slowly.
      ctx!.fillStyle = css(palette.fg);
      for (const d of dust) {
        ctx!.globalAlpha = reduceMotion ? d.a : d.a * (0.5 + 0.5 * Math.sin(clock * d.speed + d.phase));
        ctx!.fillRect(d.x + C / 2 - 1, d.y + C / 2 - 1, 2, 2);
      }

      // The mosaic: one square per lit pixel, alpha in four steps for a pixelated look.
      const box = anchorRef?.current?.getBoundingClientRect();
      const origin = box ? canvas!.getBoundingClientRect() : null;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const o = (y * cols + x) * 4;
          const a = px[o + 3]!;
          if (a < 28) continue;
          let alpha = Math.ceil((a / 255) * 4) / 4;
          if (box && origin) {
            const cx = x * C - (box.left - origin.left), cy = y * C - (box.top - origin.top);
            if (cx > -C && cx < box.width && cy > -C && cy < box.height) alpha *= 0.4;
          }
          ctx!.globalAlpha = alpha * 0.92;
          ctx!.fillStyle = `rgb(${px[o]},${px[o + 1]},${px[o + 2]})`;
          ctx!.fillRect(x * C + 0.5, y * C + 0.5, C - 1, C - 1);
        }
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
      if (reduceMotion) draw(performance.now());
    };
    const resize = new ResizeObserver(relayout);
    resize.observe(canvas);
    // Theme switches change every colour: rebuild the palette.
    const themeWatch = new MutationObserver(() => {
      palette = readPalette();
      if (reduceMotion) draw(performance.now());
    });
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

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 ${className}`}>
      <div className="aquarium-glow absolute inset-0" />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
