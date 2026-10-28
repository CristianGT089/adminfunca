import { MarigoldG } from "./Marigold";
import "./projection.css";

/** Downloads the logo inside `container` as a transparent PNG (2048 px). */
export async function downloadLogoPng(container: HTMLElement) {
  const svg = container.querySelector("svg");
  if (!svg) return;
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.querySelector(".halo-pulse")?.removeAttribute("class");
  const side = 2048;
  copy.setAttribute("width", String(side));
  copy.setAttribute("height", String(side));
  const url = URL.createObjectURL(new Blob([copy.outerHTML], { type: "image/svg+xml" }));
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  canvas.getContext("2d")!.drawImage(img, 0, 0, side, side);
  URL.revokeObjectURL(url);
  const a = document.createElement("a");
  a.download = "funca-dia-de-muertos.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
}

// FUNCA symbol (four people holding hands) redrawn as little sugar skulls.
const YELLOW = "#fbba00";
const INK = "#131c37";
const HEAD = { x: 19, y: -104, r: 21 };

/** Rotates a point of the top quarter to place the other three heads (without rotating the face). */
function rotate(x: number, y: number, degrees: number) {
  const a = (degrees * Math.PI) / 180;
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
}

function SugarSkull({ x, y, accent }: { x: number; y: number; accent: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={HEAD.r} fill={YELLOW} />
      {/* jaw */}
      <rect x={-10} y={8} width={20} height={14} rx={6} fill={YELLOW} />
      {/* little flower on the forehead */}
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={a} cx={0} cy={-3.2} r={2.6} fill={accent} transform={`translate(0 -11) rotate(${a})`} />
      ))}
      <circle cy={-11} r={1.8} fill={YELLOW} />
      {/* eyes */}
      {[-7.5, 7.5].map((ox) => (
        <g key={ox} transform={`translate(${ox} 1)`}>
          <ellipse rx={5.6} ry={6} fill={INK} />
          <circle r={2.4} fill={accent} />
          <circle r={1} fill={YELLOW} />
        </g>
      ))}
      {/* nose */}
      <path d="M -2.4 11 Q 0 6.5 2.4 11 Q 0 12.6 -2.4 11 Z" fill={INK} />
      {/* stitched smile */}
      <path d="M -8 15.5 Q 0 19.5 8 15.5" fill="none" stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
      {[-6, -2, 2, 6].map((sx) => (
        <line key={sx} x1={sx} y1={14.4} x2={sx} y2={19.4} stroke={INK} strokeWidth={1.2} strokeLinecap="round" />
      ))}
    </g>
  );
}

const ACCENTS = ["#e4007c", "#14b8a6", "#8b5cf6", "#f48c06"];

export function DayOfTheDeadLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="-165 -175 330 340" className={className} role="img" aria-label="FUNCA, Día de Muertos">
      <defs>
        <radialGradient id="halo">
          <stop offset="0" stopColor="#ffba08" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#f48c06" stopOpacity="0.18" />
          <stop offset="1" stopColor="#f48c06" stopOpacity="0" />
        </radialGradient>
        <g id="arms">
          <path d="M -40 -58 Q -2 -84 44 -72" />
          <path d="M 32 -44 L -2 -42 Q -15 -41 -15 -28 L -15 -12" />
        </g>
      </defs>

      <circle r={160} fill="url(#halo)" className="halo-pulse" />

      {/* flowers on the diagonals, between each person */}
      {[45, 135, 225, 315].map((a, i) => {
        const p = rotate(0, -118, a);
        return (
          <g key={a}>
            <path d="M 0 0 q 14 -10 30 -4 q -12 10 -30 4 z" fill="#15803d" transform={`translate(${p.x} ${p.y}) rotate(${a + 40})`} />
            <path d="M 0 0 q 14 -10 30 -4 q -12 10 -30 4 z" fill="#166534" transform={`translate(${p.x} ${p.y}) rotate(${a + 160})`} />
            <MarigoldG transform={`translate(${p.x} ${p.y}) scale(${i % 2 ? 0.42 : 0.5})`} />
          </g>
        );
      })}

      {/* the symbol's arms, with a dark outline so they stand out over the flowers */}
      {[0, 90, 180, 270].map((a) => (
        <use
          key={`b${a}`}
          href="#arms"
          transform={`rotate(${a})`}
          fill="none"
          stroke={INK}
          strokeWidth={27}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={0.55}
        />
      ))}
      {[0, 90, 180, 270].map((a) => (
        <use
          key={`a${a}`}
          href="#arms"
          transform={`rotate(${a})`}
          fill="none"
          stroke={YELLOW}
          strokeWidth={21}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {[0, 90, 180, 270].map((a, i) => {
        const p = rotate(HEAD.x, HEAD.y, a);
        return <SugarSkull key={a} x={p.x} y={p.y} accent={ACCENTS[i]} />;
      })}

      {/* catrina flower crown on the top head */}
      <MarigoldG transform={`translate(${HEAD.x - 20} ${HEAD.y - 18}) scale(0.24)`} />
      <MarigoldG transform={`translate(${HEAD.x + 20} ${HEAD.y - 18}) scale(0.24)`} />
      <MarigoldG transform={`translate(${HEAD.x} ${HEAD.y - 26}) scale(0.3)`} />
    </svg>
  );
}
