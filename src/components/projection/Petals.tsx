"use client";

import { useMemo } from "react";

// Falling marigold petals. Positions use a fixed seed so they don't "jump" between renders.
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const SHADES = ["#f48c06", "#faa307", "#ffba08", "#e8890c", "#fbba00"];

export function Petals({ count = 34 }: { count?: number }) {
  const petals = useMemo(() => {
    const r = random(31);
    return Array.from({ length: count }, (_, i) => ({
      left: r() * 100,
      size: 0.5 + r() * 0.9,
      duration: 11 + r() * 12,
      delay: -r() * 22,
      drift: (r() - 0.5) * 22,
      spin: 180 + r() * 540,
      color: SHADES[i % SHADES.length],
      opacity: 0.55 + r() * 0.4,
    }));
  }, [count]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {petals.map((p, i) => (
        <span
          key={i}
          className="petal"
          style={
            {
              left: `${p.left}%`,
              "--size": p.size,
              "--duration": `${p.duration}s`,
              "--delay": `${p.delay}s`,
              "--drift": `${p.drift}vw`,
              "--spin": `${p.spin}deg`,
              "--color": p.color,
              opacity: p.opacity,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
