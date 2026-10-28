// Marigold (cempasúchil) flower: three crowns of wavy petals over a central button.
const CROWNS = [
  { n: 14, rx: 9, ry: 20, d: 24, color: "#f48c06" },
  { n: 12, rx: 8, ry: 16, d: 17, color: "#faa307" },
  { n: 10, rx: 7, ry: 12, d: 10, color: "#ffba08" },
];

/** The flower as an SVG group, centered on the origin with radius ~45. */
export function MarigoldG({ transform }: { transform?: string }) {
  return (
    <g transform={transform}>
      {CROWNS.map((c, k) =>
        Array.from({ length: c.n }, (_, i) => (
          <ellipse
            key={`${k}-${i}`}
            cy={-c.d}
            rx={c.rx}
            ry={c.ry}
            fill={c.color}
            stroke="#a85a00"
            strokeOpacity={0.35}
            strokeWidth={1}
            transform={`rotate(${(360 / c.n) * i + k * 9})`}
          />
        ))
      )}
      <circle r={8} fill="#d97706" />
      <circle r={4.5} fill="#78350f" />
    </g>
  );
}

export function Marigold({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="-50 -50 100 100" className={className} aria-hidden="true">
      <MarigoldG />
    </svg>
  );
}
