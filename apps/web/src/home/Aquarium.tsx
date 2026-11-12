import { type RefObject, useEffect, useRef } from "react";
import type { VoiceLevels } from "./voice-levels";

// The living backdrop: a small school of fish seen from the side swims across the page. Each one is
// drawn as flat colour with a thick ink outline and a hard offset shadow (to match the neo-brutalist
// theme): tapered body, forked tail, dorsal, anal, pelvic and pectoral fins, gill line, eye and scales.
// The body ripples as it swims, and a fish rolls over smoothly when it turns around.
//
// One <canvas>, never React state, so it costs nothing in renders. During a call the fish speed up and
// warm toward the accent colour while the assistant speaks, and wag harder when the caller's microphone
// is loud. Fish fade back where they cross the headline so the text stays readable.

type RGB = [number, number, number];
type Pattern = "plain" | "bars" | "spots";
type Fish = {
  x: number;
  y: number;
  angle: number;
  flip: number; // 1 = upright heading right, -1 = mirrored for heading left; eases between
  fade: number;
  len: number; // snout to tail base
  speed: number; // px per second
  phase: number;
  seed: number;
  color: RGB;
  pattern: Pattern;
};
type Dust = { x: number; y: number; a: number; speed: number; phase: number };
type Palette = { dark: boolean; ink: RGB; accent: RGB; colors: RGB[] };

// Body half-height along the body (t = 0 snout … 1 tail base) as a share of the deepest point.
const PROFILE: [number, number][] = [
  [0, 0],
  [0.03, 0.34],
  [0.1, 0.62],
  [0.2, 0.88],
  [0.32, 1],
  [0.45, 0.95],
  [0.6, 0.72],
  [0.75, 0.45],
  [0.88, 0.26],
  [1, 0.19],
];
const DEPTH = 0.2; // deepest half-height as a share of body length
const STEPS = 28;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
function hexToRgb(hex: string, fallback: string): RGB {
  const v = parseInt((hex.trim() || fallback).replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => hexToRgb(style.getPropertyValue(name), fallback);
  const accent = get("--accent", "#ff6b1a");
  return {
    dark: document.documentElement.dataset.theme === "dark",
    ink: get("--ink", "#000000"),
    accent,
    colors: [accent, get("--warning", "#ffd23f"), get("--info", "#3d8bff"), get("--success", "#2bd47d")],
  };
}

function profile(t: number) {
  const x = clamp(t, 0, 1);
  for (let i = 1; i < PROFILE.length; i++) {
    const [t1, h1] = PROFILE[i]!;
    if (x <= t1) {
      const [t0, h0] = PROFILE[i - 1]!;
      const u = (x - t0) / (t1 - t0);
      return h0 + (h1 - h0) * (1 - Math.cos(u * Math.PI)) * 0.5;
    }
  }
  return PROFILE[PROFILE.length - 1]![1];
}

function makeFish(i: number, len: number, x: number, y: number): Fish {
  return {
    x,
    y,
    angle: rand(0, Math.PI * 2),
    flip: 1,
    fade: 1,
    len,
    speed: len * rand(0.28, 0.4),
    phase: rand(0, 6.28),
    seed: rand(0, 100),
    color: [] as unknown as RGB, // set from the palette on every frame
    pattern: (["plain", "bars", "spots"] as const)[i % 3]!,
  };
}

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
    if (!canvas || !ctx) return;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0, H = 0, dpr = 1;
    let school: Fish[] = [];
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
      palette = readPalette();

      const small = W < 640;
      const unit = Math.min(W, H);
      const count = small ? 4 : 6;
      school = Array.from({ length: count }, (_, i) => {
        const len = unit * (small ? rand(0.2, 0.28) : rand(0.14, 0.22));
        const x = W * (0.12 + 0.76 * ((i * 0.37 + 0.1) % 1));
        const y = H * (0.12 + 0.76 * ((i * 0.61 + 0.2) % 1));
        return makeFish(i, len, x, y);
      });

      // Dust: sparse little squares, denser toward the edges, clear of the centre.
      dust = [];
      const C = 10;
      for (let y = 0; y < H; y += C) {
        for (let x = 0; x < W; x += C) {
          const dx = (x / W - 0.5) * 2, dy = (y / H - 0.5) * 2;
          const d = clamp(Math.hypot(dx, dy) / 1.2, 0, 1);
          if (Math.random() < 0.16 * Math.pow(d, 2.4)) dust.push({ x, y, a: rand(0.15, 0.4), speed: rand(0.4, 1.3), phase: rand(0, 6.28) });
        }
      }
    }

    function step(f: Fish, dt: number) {
      // Wander with a slow weave; when well outside the page, ease back toward it (so fish drift off and return).
      let turn = Math.sin(clock * 0.27 + f.phase) * 0.2 + Math.sin(clock * 0.11 + f.seed) * 0.14;
      const m = f.len * 1.2;
      if (f.x < -m || f.x > W + m || f.y < -m || f.y > H + m) {
        const want = Math.atan2(H / 2 - f.y, W / 2 - f.x);
        const diff = Math.atan2(Math.sin(want - f.angle), Math.cos(want - f.angle));
        turn += clamp(diff, -1, 1) * 0.55;
      }
      if (pointer) {
        const dx = f.x - pointer.x, dy = f.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < 150) {
          const away = Math.atan2(dy, dx);
          const diff = Math.atan2(Math.sin(away - f.angle), Math.cos(away - f.angle));
          turn += clamp(diff, -1, 1) * (1 - d / 150) * 0.9;
        }
      }
      f.angle += clamp(turn, -0.7, 0.7) * dt;
      const v = f.speed * (1 + voice * 1.6);
      f.x += Math.cos(f.angle) * v * dt;
      f.y += Math.sin(f.angle) * v * dt;
      f.flip += (Math.cos(f.angle) >= 0 ? 1 - f.flip : -1 - f.flip) * Math.min(1, dt * 5);
    }

    // Draw one fish. Local space: the snout is at the origin, the fish heads along +x after the rotation
    // below, and the body trails behind at negative x.
    function paint(f: Fish, tint: number, anchor: DOMRect | null, origin: DOMRect | null) {
      const L = f.len;
      const D = L * DEPTH;
      const ink = css(palette.ink);
      const lw = clamp(L * 0.022, 1.6, 3.5);
      const wagAmp = L * (0.035 + user * 0.03 + voice * 0.015);
      // Sideways ripple: still at the head, strongest at the tail.
      const spine = (t: number) => Math.sin(clock * 5 - t * 4.2 + f.phase) * wagAmp * Math.pow(t, 1.4);
      const px = (t: number) => -t * L;
      const top = (t: number) => spine(t) - profile(t) * D * 0.95;
      const bot = (t: number) => spine(t) + profile(t) * D * 1.05;

      const base = mix(f.color, palette.accent, tint);
      const belly = mix(base, [255, 255, 255], 0.55);
      const finCol = mix(base, [255, 255, 255], 0.22);
      const dark = mix(base, [0, 0, 0], 0.28);

      // Fade out where the fish crosses the headline block.
      if (anchor && origin) {
        const ax = anchor.left - origin.left, ay = anchor.top - origin.top;
        const over = f.x > ax - L && f.x < ax + anchor.width + L && f.y > ay - L * 0.5 && f.y < ay + anchor.height + L * 0.5;
        f.fade += ((over ? 0.2 : 1) - f.fade) * 0.08;
      } else f.fade += (1 - f.fade) * 0.08;

      // --- Shapes (Path2D) -----------------------------------------------------------------------
      const body = new Path2D();
      body.moveTo(px(0), top(0));
      for (let i = 1; i <= STEPS; i++) body.lineTo(px(i / STEPS), top(i / STEPS));
      for (let i = STEPS; i >= 0; i--) body.lineTo(px(i / STEPS), bot(i / STEPS));
      body.closePath();

      // Forked tail fin on the tail base, angled along the end of the spine.
      const tailAng = Math.atan2(spine(1) - spine(0.9), px(1) - px(0.9));
      const sway = Math.sin(clock * 5 - 4.2 + f.phase + 0.8) * 0.28;
      const tx = px(1) + L * 0.02, ty = spine(1);
      const rot = (dx: number, dy: number, a: number) => [tx + Math.cos(a) * dx - Math.sin(a) * dy, ty + Math.sin(a) * dx + Math.cos(a) * dy] as const;
      const a = tailAng + Math.PI + sway * 0.5; // frame in which +x runs toward the head, so -dx trails behind
      const tail = new Path2D();
      const e1 = rot(0, -D * 0.2, a), upper = rot(-L * 0.24, -D * 1.15, a), notch = rot(-L * 0.12, 0, a), lower = rot(-L * 0.24, D * 1.15, a), e2 = rot(0, D * 0.2, a);
      const c1 = rot(-L * 0.1, -D * 0.9, a), c2 = rot(-L * 0.1, -D * 0.3, a), c3 = rot(-L * 0.1, D * 0.3, a), c4 = rot(-L * 0.1, D * 0.9, a);
      tail.moveTo(e1[0], e1[1]);
      tail.quadraticCurveTo(c1[0], c1[1], upper[0], upper[1]);
      tail.quadraticCurveTo(c2[0], c2[1], notch[0], notch[1]);
      tail.quadraticCurveTo(c3[0], c3[1], lower[0], lower[1]);
      tail.quadraticCurveTo(c4[0], c4[1], e2[0], e2[1]);
      tail.closePath();

      // Dorsal fin: a swept-back sail along the back.
      const dorsal = new Path2D();
      dorsal.moveTo(px(0.26), top(0.26));
      dorsal.quadraticCurveTo(px(0.3), top(0.3) - D * 0.55, px(0.38), top(0.38) - D * 0.85);
      dorsal.quadraticCurveTo(px(0.5), top(0.5) - D * 0.35, px(0.62), top(0.62) + D * 0.02);
      dorsal.closePath();

      // Anal fin and pelvic fin underneath.
      const anal = new Path2D();
      anal.moveTo(px(0.62), bot(0.62));
      anal.quadraticCurveTo(px(0.7), bot(0.7) + D * 0.5, px(0.8), bot(0.8) + D * 0.45);
      anal.quadraticCurveTo(px(0.78), bot(0.78) + D * 0.05, px(0.8), bot(0.8));
      anal.closePath();
      const pelvic = new Path2D();
      pelvic.moveTo(px(0.38), bot(0.38));
      pelvic.quadraticCurveTo(px(0.4), bot(0.4) + D * 0.55, px(0.5), bot(0.5) + D * 0.5);
      pelvic.quadraticCurveTo(px(0.47), bot(0.47) + D * 0.1, px(0.48), bot(0.48));
      pelvic.closePath();

      // Pectoral fin: a leaf behind the gill that flaps gently.
      const flap = Math.sin(clock * 3 + f.phase) * 0.35;
      const p0 = { x: px(0.27), y: spine(0.27) + D * 0.12 };
      const pectoral = new Path2D();
      pectoral.moveTo(p0.x, p0.y - D * 0.1);
      pectoral.quadraticCurveTo(p0.x - L * 0.1, p0.y - D * 0.25 + flap * D * 0.4, p0.x - L * 0.17, p0.y + D * (0.38 + flap * 0.5));
      pectoral.quadraticCurveTo(p0.x - L * 0.04, p0.y + D * 0.4, p0.x, p0.y + D * 0.12);
      pectoral.closePath();

      // --- Draw ---------------------------------------------------------------------------------
      // Hard offset shadow: same silhouette, shifted down-right in screen space.
      ctx!.save();
      ctx!.globalAlpha = f.fade;
      ctx!.translate(f.x + 4, f.y + 4);
      ctx!.rotate(f.angle);
      ctx!.scale(1, f.flip);
      ctx!.fillStyle = ink;
      for (const p of [tail, dorsal, anal, pelvic, body]) ctx!.fill(p);
      ctx!.restore();

      ctx!.save();
      ctx!.globalAlpha = f.fade;
      ctx!.translate(f.x, f.y);
      ctx!.rotate(f.angle);
      ctx!.scale(1, f.flip);
      ctx!.lineJoin = "round";
      ctx!.lineCap = "round";

      ctx!.lineWidth = lw;
      ctx!.strokeStyle = ink;
      ctx!.fillStyle = css(finCol);
      for (const p of [tail, dorsal, anal, pelvic]) {
        ctx!.fill(p);
        ctx!.stroke(p);
      }
      // Body, with belly shading and scale pattern clipped inside.
      ctx!.fillStyle = css(base);
      ctx!.fill(body);
      ctx!.save();
      ctx!.clip(body);
      ctx!.fillStyle = css(belly);
      ctx!.beginPath();
      ctx!.moveTo(px(0), spine(0) + D * 0.28);
      for (let i = 1; i <= STEPS; i++) ctx!.lineTo(px(i / STEPS), spine(i / STEPS) + D * (0.28 - 0.1 * (i / STEPS)));
      for (let i = STEPS; i >= 0; i--) ctx!.lineTo(px(i / STEPS), bot(i / STEPS) + 2);
      ctx!.closePath();
      ctx!.fill();
      ctx!.strokeStyle = css(dark);
      ctx!.fillStyle = css(dark);
      if (f.pattern === "bars") {
        ctx!.lineWidth = L * 0.035;
        for (const t of [0.4, 0.52, 0.64, 0.76]) {
          ctx!.beginPath();
          ctx!.moveTo(px(t), top(t) - 2);
          ctx!.quadraticCurveTo(px(t + 0.03), spine(t), px(t), bot(t) + 2);
          ctx!.stroke();
        }
      } else if (f.pattern === "spots") {
        for (const [t, v, r] of [[0.42, -0.45, 0.11], [0.55, 0.1, 0.09], [0.68, -0.3, 0.08], [0.5, -0.7, 0.06], [0.78, 0.05, 0.06]] as const) {
          ctx!.beginPath();
          ctx!.arc(px(t), spine(t) + v * D * profile(t), L * r * 0.55, 0, Math.PI * 2);
          ctx!.fill();
        }
      } else {
        // Scales: rows of small overlapping arcs along the flank.
        ctx!.lineWidth = lw * 0.45;
        ctx!.globalAlpha = f.fade * 0.55;
        for (let row = -1; row <= 1; row++) {
          for (let t = 0.3 + (row === 0 ? 0 : 0.025); t < 0.8; t += 0.05) {
            const cx = px(t), cy = spine(t) + row * D * 0.36 * profile(t);
            ctx!.beginPath();
            ctx!.arc(cx, cy, L * 0.03, -Math.PI * 0.45, Math.PI * 0.45);
            ctx!.stroke();
          }
        }
        ctx!.globalAlpha = f.fade;
      }
      ctx!.restore();
      ctx!.strokeStyle = ink;
      ctx!.lineWidth = lw;
      ctx!.stroke(body);

      // Gill line, pectoral fin, mouth and eye.
      ctx!.beginPath();
      ctx!.moveTo(px(0.2), top(0.2) + D * 0.12);
      ctx!.quadraticCurveTo(px(0.25), spine(0.25), px(0.2), bot(0.2) - D * 0.1);
      ctx!.stroke();
      ctx!.fillStyle = css(finCol);
      ctx!.fill(pectoral);
      ctx!.stroke(pectoral);
      ctx!.beginPath();
      ctx!.moveTo(px(0.012), spine(0.03) + D * 0.12);
      ctx!.lineTo(px(0.07), spine(0.07) + D * 0.2);
      ctx!.stroke();
      const eye = { x: px(0.1), y: spine(0.1) - D * 0.18 };
      ctx!.fillStyle = "#ffffff";
      ctx!.beginPath();
      ctx!.arc(eye.x, eye.y, D * 0.22, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.lineWidth = lw * 0.8;
      ctx!.stroke();
      ctx!.fillStyle = ink;
      ctx!.beginPath();
      ctx!.arc(eye.x + D * 0.05, eye.y, D * 0.11, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();
    }

    function draw(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      voice += (clamp((levels?.current?.agent ?? 0) * 1.8, 0, 1) - voice) * Math.min(1, dt * 6);
      user += (clamp((levels?.current?.user ?? 0) * 1.8, 0, 1) - user) * Math.min(1, dt * 6);
      if (!reduceMotion) {
        clock += dt;
        for (const f of school) step(f, dt);
      }

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, W, H);

      // Dust twinkles slowly.
      ctx!.fillStyle = css(palette.ink);
      for (const d of dust) {
        ctx!.globalAlpha = reduceMotion ? d.a : d.a * (0.5 + 0.5 * Math.sin(clock * d.speed + d.phase));
        ctx!.fillRect(d.x, d.y, 3, 3);
      }
      ctx!.globalAlpha = 1;

      const anchor = anchorRef?.current?.getBoundingClientRect() ?? null;
      const origin = anchor ? canvas!.getBoundingClientRect() : null;
      school.forEach((f, i) => {
        f.color = palette.colors[i % palette.colors.length]!;
        paint(f, voice * (i === 0 ? 0.85 : 0.4), anchor, origin);
      });
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
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
