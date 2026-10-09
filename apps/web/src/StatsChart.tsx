import { useId, useState } from "react";
import type { TrendPoint } from "./game-trends";
const date = (time: number) =>
  new Date(time).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function StatsChart({
  title,
  points,
  score = false,
}: {
  title: string;
  points: TrendPoint[];
  score?: boolean;
}) {
  const id = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const current =
    points[Math.min(selected ?? points.length - 1, points.length - 1)];
  const low = score ? 0 : Math.min(0, ...points.map((p) => p.value));
  const high = score ? 100 : Math.max(0, ...points.map((p) => p.value));
  const span = high - low || 10;
  const first = points[0]?.time ?? 0,
    last = points.at(-1)?.time ?? 0;
  const x = (p: TrendPoint, i: number) =>
    points.length === 1
      ? 300
      : 56 +
        (last > first
          ? (p.time - first) / (last - first)
          : i / Math.max(1, points.length - 1)) *
          520;
  const y = (v: number) => 172 - ((v - low) / span) * 140;
  const format = (value: number) =>
    score
      ? `${Math.round(value)}/100`
      : `${value > 0 ? "+" : ""}${value} chips`;
  return (
    <section className="stat-chart" aria-labelledby={id}>
      <div className="chart-heading">
        <h3 id={id}>{title}</h3>
        {current && <strong>{format(current.value)}</strong>}
      </div>
      {!points.length ? (
        <div className="chart-empty">
          <p>{score ? "No scored decisions yet" : "No completed hands yet"}</p>
          <small>
            {score
              ? "Only sufficiently precise postflop reviews receive a score."
              : "Finish a hand to start the profit graph."}
          </small>
        </div>
      ) : (
        <>
          <svg
            viewBox="0 0 600 215"
            role="group"
            aria-label={`${title}, ${points.length} recorded hands`}
          >
            {[low, low + span / 2, low + span].map((v, i) => (
              <g key={i}>
                <line
                  x1="56"
                  x2="576"
                  y1={y(v)}
                  y2={y(v)}
                  className="chart-grid"
                />
                <text x="45" y={y(v) + 4} textAnchor="end">
                  {Math.round(v)}
                </text>
              </g>
            ))}
            {low < 0 && high > 0 && (
              <line
                x1="56"
                x2="576"
                y1={y(0)}
                y2={y(0)}
                className="chart-zero"
              />
            )}
            {points.length > 1 && (
              <polyline
                points={points
                  .map((p, i) => `${x(p, i)},${y(p.value)}`)
                  .join(" ")}
                className="chart-line"
              />
            )}
            {points.map((p, i) => (
              <g key={p.hand}>
                <circle
                  cx={x(p, i)}
                  cy={y(p.value)}
                  r="12"
                  className="chart-hit"
                  tabIndex={0}
                  role="button"
                  aria-label={`Hand ${p.hand}, ${date(p.time)}, ${format(p.value)}`}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => setSelected(i)}
                  onFocus={() => setSelected(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(i);
                    }
                  }}
                />
                <circle
                  cx={x(p, i)}
                  cy={y(p.value)}
                  r={current === p ? 5 : 3}
                  className="chart-dot"
                  pointerEvents="none"
                />
              </g>
            ))}
            <text x="56" y="205">
              {date(first)}
            </text>
            {points.length > 1 && (
              <text x="576" y="205" textAnchor="end">
                {date(last)}
              </text>
            )}
          </svg>
          <p className="chart-readout" aria-live="polite">
            Hand {current.hand} · {date(current.time)}
            {score
              ? ` · ${current.decisions} decisions`
              : " · cumulative profit"}
          </p>
        </>
      )}
    </section>
  );
}
