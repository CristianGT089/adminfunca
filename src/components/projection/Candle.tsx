// Altar candle with a flickering flame. `height` in units relative to the container size.
export function Candle({ height = 1, delay = 0 }: { height?: number; delay?: number }) {
  return (
    <div className="candle" style={{ "--height": height, "--delay": `${delay}s` } as React.CSSProperties} aria-hidden="true">
      <div className="candle-glow" />
      <div className="candle-flame" />
      <div className="candle-wick" />
      <div className="candle-body" />
    </div>
  );
}
