// Papel picado garland. Shapes are "cut out" with an SVG mask; in the middle, the flags spell FUNCA.
type Motif = "flower" | "skull" | "heart" | "candle" | { letter: string };

const MOTIFS: Motif[] = [
  "flower",
  "skull",
  "heart",
  "candle",
  { letter: "F" },
  { letter: "U" },
  { letter: "N" },
  { letter: "C" },
  { letter: "A" },
  "candle",
  "heart",
  "skull",
  "flower",
];

const COLORS = ["#e4007c", "#f48c06", "#8b5cf6", "#14b8a6", "#fbba00", "#22c55e", "#3b82f6"];

const SILHOUETTE = "M0 0H100V102" + " a8.333 8.333 0 0 1 -16.667 0".repeat(6) + "Z";

function Cutout({ motif }: { motif: Motif }) {
  if (typeof motif === "object")
    return (
      <text x={50} y={78} textAnchor="middle" fontFamily="Poppins" fontWeight={800} fontSize={62} fill="black">
        {motif.letter}
      </text>
    );
  switch (motif) {
    case "flower":
      return (
        <g transform="translate(50 56)">
          {Array.from({ length: 8 }, (_, i) => (
            <ellipse key={i} cy={-15} rx={6} ry={11} transform={`rotate(${i * 45})`} fill="black" />
          ))}
          <circle r={5} fill="white" />
        </g>
      );
    case "skull":
      return (
        <g transform="translate(50 54)" fill="black">
          <path d="M-22 -2 a22 22 0 1 1 44 0 v8 q0 6 -8 8 v8 h-28 v-8 q-8 -2 -8 -8 z" />
          <g fill="white">
            <circle cx={-9} cy={0} r={6.5} />
            <circle cx={9} cy={0} r={6.5} />
            <path d="M-3 12 L0 6 L3 12 Z" />
            <rect x={-8} y={17} width={3} height={6} />
            <rect x={-1.5} y={17} width={3} height={6} />
            <rect x={5} y={17} width={3} height={6} />
          </g>
        </g>
      );
    case "heart":
      return <path d="M50 80 C20 60 20 30 38 30 C46 30 50 38 50 42 C50 38 54 30 62 30 C80 30 80 60 50 80 Z" fill="black" />;
    case "candle":
      return (
        <g fill="black">
          <path d="M50 22 C58 34 58 42 50 46 C42 42 42 34 50 22 Z" />
          <rect x={41} y={50} width={18} height={34} rx={2} />
        </g>
      );
  }
}

function Flag({ motif, color, i }: { motif: Motif; color: string; i: number }) {
  const id = `cutout-${i}`;
  return (
    <div className="flag" style={{ "--delay": `${(i % 5) * -0.7}s`, "--duration": `${3.6 + (i % 3) * 0.6}s` } as React.CSSProperties}>
      <svg viewBox="0 0 100 112" className="h-full w-full overflow-visible">
        <defs>
          <mask id={id}>
            <path d={SILHOUETTE} fill="white" />
            {/* cut-out border: diamonds on top and dots at the bottom */}
            {Array.from({ length: 9 }, (_, k) => (
              <rect key={`r${k}`} x={8 + k * 10.5} y={8} width={4} height={4} transform={`rotate(45 ${10 + k * 10.5} 10)`} fill="black" />
            ))}
            {Array.from({ length: 6 }, (_, k) => (
              <circle key={`c${k}`} cx={8.33 + k * 16.67} cy={98} r={2.4} fill="black" />
            ))}
            <Cutout motif={motif} />
          </mask>
        </defs>
        <path d={SILHOUETTE} fill={color} mask={`url(#${id})`} />
        <path d={SILHOUETTE} fill="white" opacity={0.08} mask={`url(#${id})`} />
      </svg>
    </div>
  );
}

export function PapelPicado() {
  return (
    <div className="papel-picado" aria-hidden="true">
      <div className="garland-string" />
      <div className="flags">
        {MOTIFS.map((m, i) => (
          <Flag key={i} motif={m} color={COLORS[i % COLORS.length]} i={i} />
        ))}
      </div>
    </div>
  );
}
