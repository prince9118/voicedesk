import { type RefObject, useEffect, useRef } from "react";
import type { VoiceLevels } from "./voice-levels";

// The living backdrop: a few small fish seen from above (mottled koi and a hammerhead) glide across a
// clean page, drawn as fine mosaic pixels, with faint dust at the edges and a soft halo behind the
// headline.
//
// Each frame the fish are drawn smoothly into a tiny offscreen canvas (one pixel per mosaic cell),
// then every lit pixel is painted as a square on the real canvas. One <canvas>, never React state,
// so it costs nothing in renders. During a call the fish speed up and warm toward the accent colour
// while the assistant speaks, and wag harder when the caller's microphone is loud.

type RGB = [number, number, number];
type Kind = "koi" | "shark";
type Spot = { t: number; v: number; r: number; dark: boolean };
type Fish = {
  kind: Kind;
  seg: { x: number; y: number }[]; // spine, head first
  angle: number;
  len: number;
  speed: number; // px per second
  phase: number;
  seed: number;
  base: RGB;
  accent: RGB; // the second tone: koi patches, shark underside highlights
  spots: Spot[];
};
type Dust = { x: number; y: number; a: number; speed: number; phase: number };
type Palette = { dark: boolean; accent: RGB; fg: RGB };

const SEGMENTS = 22;
// Body half-width along the spine, head to tail, as a share of the widest point.
const PROFILE: Record<Kind, number[]> = {
  koi: [0.55, 0.85, 1, 0.98, 0.88, 0.72, 0.54, 0.38, 0.26, 0.18, 0.14],
  shark: [0.5, 0.8, 1, 0.97, 0.84, 0.66, 0.48, 0.33, 0.22, 0.15, 0.12],
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
function hexToRgb(hex: string): RGB {
  const v = parseInt(hex.trim().replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  return {
    dark: document.documentElement.dataset.theme === "dark",
    accent: hexToRgb(style.getPropertyValue("--accent") || "#f76b15"),
    fg: hexToRgb(style.getPropertyValue("--fg") || "#21201c"),
  };
}

function makeFish(kind: Kind, len: number, x: number, y: number): Fish {
  const angle = rand(0, Math.PI * 2);
  const segLen = len / SEGMENTS;
  const koi = kind === "koi";
  const spots: Spot[] = Array.from({ length: koi ? 46 : 22 }, () => ({
    t: rand(0.04, 0.88),
    v: rand(-0.95, 0.95),
    r: koi ? rand(0.12, 0.38) : rand(0.08, 0.2),
    dark: Math.random() < (koi ? 0.45 : 0.6),
  }));
  return {
    kind,
    seg: Array.from({ length: SEGMENTS }, (_, k) => ({ x: x - Math.cos(angle) * segLen * k, y: y - Math.sin(angle) * segLen * k })),
    angle,
    len,
    speed: len * (koi ? rand(0.16, 0.24) : rand(0.24, 0.32)),
    phase: rand(0, 6.28),
    seed: rand(0, 100),
    base: koi ? [206, 196, 178] : [104, 116, 146],
    accent: koi ? [158, 112, 66] : [186, 194, 212],
    spots,
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
    const low = document.createElement("canvas");
    const lctx = low.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx || !lctx) return;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0, H = 0, C = 5, dpr = 1, cols = 0, rows = 0;
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
      C = W < 640 ? 4 : 5;
      cols = Math.ceil(W / C);
      rows = Math.ceil(H / C);
      low.width = cols;
      low.height = rows;
      palette = readPalette();

      const small = W < 640;
      const unit = Math.min(W, H);
      const kinds: Kind[] = small ? ["koi", "shark", "koi"] : ["koi", "shark", "koi", "shark"];
      school = kinds.map((kind, i) => {
        const len = unit * (small ? rand(0.4, 0.5) : rand(0.3, 0.4)) * (kind === "shark" ? 1.1 : 1);
        // Spread them out: one per quadrant-ish.
        const x = W * (0.15 + 0.7 * ((i * 0.37 + 0.1) % 1));
        const y = H * (0.15 + 0.7 * ((i * 0.61 + 0.2) % 1));
        return makeFish(kind, len, x, y);
      });

      // Dust: sparse dots, denser toward the edges and in loose clusters, clear of the centre.
      dust = [];
      for (let y = 0; y < H; y += C * 2) {
        for (let x = 0; x < W; x += C * 2) {
          const dx = (x / W - 0.5) * 2, dy = (y / H - 0.5) * 2;
          const d = clamp(Math.hypot(dx, dy) / 1.2, 0, 1);
          const cluster = 0.5 + 0.5 * Math.sin(x * 0.011 + 1.3) * Math.sin(y * 0.014 + 0.4);
          if (Math.random() < 0.3 * Math.pow(d, 2.4) * cluster) {
            dust.push({ x, y, a: rand(0.12, 0.35), speed: rand(0.4, 1.3), phase: rand(0, 6.28) });
          }
        }
      }
    }

    function step(f: Fish, dt: number) {
      const head = f.seg[0]!;
      // Wander with a slow weave; when well outside the page, ease back toward it (so fish drift off and return).
      let turn = Math.sin(clock * 0.27 + f.phase) * 0.2 + Math.sin(clock * 0.11 + f.seed) * 0.14;
      const m = f.len * 0.8;
      if (head.x < -m || head.x > W + m || head.y < -m || head.y > H + m) {
        const want = Math.atan2(H / 2 - head.y, W / 2 - head.x);
        const diff = Math.atan2(Math.sin(want - f.angle), Math.cos(want - f.angle));
        turn += clamp(diff, -1, 1) * 0.55;
      }
      if (pointer) {
        const dx = head.x - pointer.x, dy = head.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < 150) {
          const away = Math.atan2(dy, dx);
          const diff = Math.atan2(Math.sin(away - f.angle), Math.cos(away - f.angle));
          turn += clamp(diff, -1, 1) * (1 - d / 150) * 0.9;
        }
      }
      f.angle += clamp(turn, -0.7, 0.7) * dt;
      const v = f.speed * (1 + voice * 1.6);
      head.x += Math.cos(f.angle) * v * dt;
      head.y += Math.sin(f.angle) * v * dt;
      const segLen = f.len / SEGMENTS;
      for (let i = 1; i < f.seg.length; i++) {
        const p = f.seg[i - 1]!, s = f.seg[i]!;
        const dx = s.x - p.x, dy = s.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        s.x = p.x + (dx / d) * segLen;
        s.y = p.y + (dy / d) * segLen;
      }
    }

    // Draw one fish, smoothly, in page pixels, onto the low-res canvas.
    function paint(f: Fish, tint: number) {
      const L = lctx!;
      const n = f.seg.length;
      const koi = f.kind === "koi";
      const prof = PROFILE[f.kind];
      const maxR = f.len * (koi ? 0.082 : 0.068);
      const wagAmp = f.len * (0.04 + user * 0.03);
      const wag = (i: number) => Math.sin(clock * 3 - i * 0.38 + f.phase) * wagAmp * Math.pow(i / n, 1.3);
      const width = (t: number) => {
        const q = clamp(t, 0, 1) * (prof.length - 1);
        const j = Math.min(prof.length - 2, Math.floor(q));
        return (prof[j]! + (prof[j + 1]! - prof[j]!) * (q - j)) * maxR;
      };
      const lift = (c: RGB) => mix(palette.dark ? mix(c, [255, 255, 255], 0.35) : c, palette.accent, tint);

      // Spine with the swimming wave applied sideways; `a` is the normal pointing to the fish's left.
      const pts = f.seg.map((s, i) => {
        const prev = f.seg[Math.max(0, i - 1)]!, next = f.seg[Math.min(n - 1, i + 1)]!;
        const a = Math.atan2(next.y - prev.y, next.x - prev.x) + Math.PI / 2;
        const w = wag(i);
        return { x: s.x + Math.cos(a) * w, y: s.y + Math.sin(a) * w, a };
      });
      const at = (t: number) => {
        const q = clamp(t, 0, 1) * (n - 1);
        const i = Math.min(n - 2, Math.floor(q));
        const u = q - i;
        const p = pts[i]!, r = pts[i + 1]!;
        return { x: p.x + (r.x - p.x) * u, y: p.y + (r.y - p.y) * u, a: p.a + (r.a - p.a) * u };
      };
      const fin = css(lift(mix(f.base, f.accent, koi ? 0.25 : 0.1)));
      const dim = css(lift(mix(f.base, [0, 0, 0], 0.18)));

      // Pectoral fins: swept back from behind the head. Sharks have big pointed ones, koi small rounded ones.
      L.fillStyle = fin;
      L.globalAlpha = koi ? 0.8 : 1;
      const pecT = 0.2;
      const pp = at(pecT);
      const heading = pp.a - Math.PI / 2;
      for (const side of [-1, 1]) {
        const flap = Math.sin(clock * 2 + f.phase + side * 1.3) * 0.12;
        const out = pp.a + (side === 1 ? 0 : Math.PI);
        const root = { x: pp.x + Math.cos(out) * width(pecT) * 0.9, y: pp.y + Math.sin(out) * width(pecT) * 0.9 };
        const back = heading + Math.PI - side * (0.55 + flap);
        const fl = f.len * (koi ? 0.13 : 0.2);
        const spread = koi ? 0.5 : 0.28;
        L.beginPath();
        L.moveTo(root.x, root.y);
        L.quadraticCurveTo(root.x + Math.cos(out) * fl * 0.5 + Math.cos(heading) * fl * 0.1, root.y + Math.sin(out) * fl * 0.5 + Math.sin(heading) * fl * 0.1, root.x + Math.cos(back) * fl, root.y + Math.sin(back) * fl);
        L.quadraticCurveTo(root.x + Math.cos(back + side * spread) * fl * 0.5, root.y + Math.sin(back + side * spread) * fl * 0.5, root.x, root.y);
        L.fill();
      }

      // Tail: a soft fan for koi; a swept crescent with a longer upper lobe for sharks.
      const tail = pts[n - 1]!, before = pts[n - 5]!;
      const ta = Math.atan2(tail.y - before.y, tail.x - before.x);
      const tl = f.len * (koi ? 0.2 : 0.24);
      const sway = Math.sin(clock * 3 - n * 0.38 + f.phase + 0.9) * 0.3;
      const tip = (ang: number, d: number) => [tail.x + Math.cos(ang) * d, tail.y + Math.sin(ang) * d] as const;
      const upper = tip(ta + 0.5 + sway, tl * (koi ? 1 : 1.25));
      const lower = tip(ta - 0.45 + sway, tl * (koi ? 0.95 : 0.7));
      const notch = tip(ta + sway * 0.6, tl * 0.45);
      const cu = tip(ta + 0.3 + sway * 0.8, tl * 0.75), cn1 = tip(ta + 0.12, tl * 0.35);
      const cn2 = tip(ta - 0.12, tl * 0.35), cl = tip(ta - 0.3 + sway * 0.8, tl * 0.7);
      L.beginPath();
      L.moveTo(tail.x, tail.y);
      L.quadraticCurveTo(cu[0], cu[1], upper[0], upper[1]);
      L.quadraticCurveTo(cn1[0], cn1[1], notch[0], notch[1]);
      L.quadraticCurveTo(cn2[0], cn2[1], lower[0], lower[1]);
      L.quadraticCurveTo(cl[0], cl[1], tail.x, tail.y);
      L.fill();
      L.globalAlpha = 1;

      // Body: smooth outline from the width profile, with a rounded head.
      const nT = (i: number) => i / (n - 1);
      const left = pts.map((p, i) => ({ x: p.x + Math.cos(p.a) * width(nT(i)), y: p.y + Math.sin(p.a) * width(nT(i)) }));
      const right = pts.map((p, i) => ({ x: p.x - Math.cos(p.a) * width(nT(i)), y: p.y - Math.sin(p.a) * width(nT(i)) }));
      const h0 = pts[0]!;
      L.beginPath();
      L.moveTo(left[0]!.x, left[0]!.y);
      L.arc(h0.x, h0.y, width(0), h0.a, h0.a - Math.PI, true); // round snout
      for (let i = 1; i < n; i++) L.lineTo(right[i]!.x, right[i]!.y);
      for (let i = n - 1; i >= 1; i--) L.lineTo(left[i]!.x, left[i]!.y);
      L.closePath();
      L.fillStyle = css(lift(f.base));
      L.fill();

      // Mottling, clipped to the body: spots live in spine space so they swim with the fish.
      L.save();
      L.clip();
      for (const s of f.spots) {
        const p = at(s.t);
        const w = width(s.t);
        const x = p.x + Math.cos(p.a) * s.v * w, y = p.y + Math.sin(p.a) * s.v * w;
        L.fillStyle = s.dark ? css(lift(koi ? mix(f.accent, [30, 26, 24], 0.45) : dimShade(f.base))) : css(lift(koi ? f.accent : f.accent));
        L.beginPath();
        L.ellipse(x, y, maxR * s.r * 1.3, maxR * s.r, p.a - Math.PI / 2, 0, Math.PI * 2);
        L.fill();
      }
      L.restore();

      // Hammerhead: a wide, flat crossbar for a head, with an eye at each end.
      if (!koi) {
        const bar = f.len * 0.085;
        const hh = pts[0]!;
        const hd = hh.a - Math.PI / 2;
        L.fillStyle = css(lift(mix(f.base, [0, 0, 0], 0.05)));
        L.beginPath();
        L.ellipse(hh.x + Math.cos(hd) * maxR * 0.15, hh.y + Math.sin(hd) * maxR * 0.15, bar, maxR * 0.42, hh.a, 0, Math.PI * 2);
        L.fill();
        L.fillStyle = palette.dark ? "#0e0e10" : "#23232b";
        for (const side of [-1, 1]) {
          L.beginPath();
          L.arc(hh.x + Math.cos(hh.a) * side * bar * 0.85, hh.y + Math.sin(hh.a) * side * bar * 0.85, Math.max(0.7, maxR * 0.13), 0, Math.PI * 2);
          L.fill();
        }
      } else {
        L.fillStyle = palette.dark ? "#0e0e10" : "#2a2622";
        const e = pts[1]!;
        for (const side of [-1, 1]) {
          L.beginPath();
          L.arc(e.x + Math.cos(e.a) * side * width(nT(1)) * 0.7, e.y + Math.sin(e.a) * side * width(nT(1)) * 0.7, Math.max(0.7, maxR * 0.14), 0, Math.PI * 2);
          L.fill();
        }
      }
      void dim;
    }

    // A darker shade of the shark's slate for its speckles.
    function dimShade(c: RGB): RGB {
      return mix(c, [20, 24, 40], 0.45);
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

      lctx!.setTransform(1, 0, 0, 1, 0, 0);
      lctx!.clearRect(0, 0, cols, rows);
      lctx!.setTransform(1 / C, 0, 0, 1 / C, 0, 0);
      school.forEach((f, i) => paint(f, voice * (i === 0 ? 0.85 : 0.45)));
      lctx!.globalAlpha = 1;
      const px = lctx!.getImageData(0, 0, cols, rows).data;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, W, H);

      // Dust twinkles slowly.
      ctx!.fillStyle = css(palette.fg);
      for (const d of dust) {
        ctx!.globalAlpha = reduceMotion ? d.a : d.a * (0.5 + 0.5 * Math.sin(clock * d.speed + d.phase));
        ctx!.fillRect(d.x + C / 2 - 0.75, d.y + C / 2 - 0.75, 1.5, 1.5);
      }

      // The mosaic: one square per lit pixel, alpha in a few steps for a pixelated look.
      const box = anchorRef?.current?.getBoundingClientRect();
      const origin = box ? canvas!.getBoundingClientRect() : null;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const o = (y * cols + x) * 4;
          const a = px[o + 3]!;
          if (a < 40) continue;
          let alpha = Math.ceil((a / 255) * 5) / 5;
          if (box && origin) {
            const cx = x * C - (box.left - origin.left), cy = y * C - (box.top - origin.top);
            if (cx > -C && cx < box.width && cy > -C && cy < box.height) alpha *= 0.22;
          }
          // A little per-cell grain so the mosaic reads as texture, not flat tiles.
          const grain = 1 + ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 17) / 17 * 0.2 - 0.1;
          ctx!.globalAlpha = alpha * 0.95;
          ctx!.fillStyle = `rgb(${clamp(px[o]! * grain, 0, 255) | 0},${clamp(px[o + 1]! * grain, 0, 255) | 0},${clamp(px[o + 2]! * grain, 0, 255) | 0})`;
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
      <div className="page-glow absolute inset-0" />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
