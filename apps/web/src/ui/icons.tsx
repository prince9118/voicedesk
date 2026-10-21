// Brand mark: four voice bars on a solid tile. Icons elsewhere come from lucide-react.
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className="shrink-0">
      <rect width="28" height="28" rx="7" className="fill-fg" />
      {[
        [7, 11, 6],
        [11.5, 7, 14],
        [16, 9.5, 9],
        [20.5, 12, 4],
      ].map(([x, y, h]) => (
        <rect key={x} x={x! - 1.25} y={y} width="2.5" height={h} rx="1.25" className="fill-canvas" />
      ))}
      <circle cx="20.5" cy="7.5" r="2" className="fill-accent" />
    </svg>
  );
}
