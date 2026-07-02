// Dependency-free SVG charts for the admin analytics dashboard. Pure
// presentational server components — data is computed in src/lib/admin-metrics.ts.

type Point = { label: string; value: number };

const W = 600;
const H = 170;
const PAD = { top: 12, right: 12, bottom: 22, left: 12 };

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function xFor(i: number, n: number): number {
  if (n <= 1) return PAD.left;
  return PAD.left + (i * (W - PAD.left - PAD.right)) / (n - 1);
}
function yFor(v: number, max: number): number {
  return PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);
}

function axisLabels(points: Point[]) {
  const n = points.length;
  if (n === 0) return [];
  const idxs = [0, Math.floor(n / 2), n - 1];
  return [...new Set(idxs)].map((i) => ({ x: xFor(i, n), label: points[i].label }));
}

export function AreaChart({
  points,
  color = "#4f46e5",
  prefix = "",
}: {
  points: Point[];
  color?: string;
  prefix?: string;
}) {
  const max = niceMax(Math.max(1, ...points.map((p) => p.value)));
  const n = points.length;
  const line = points.map((p, i) => `${xFor(i, n)},${yFor(p.value, max)}`).join(" ");
  const area = `${PAD.left},${yFor(0, max)} ${line} ${xFor(n - 1, n)},${yFor(0, max)}`;
  const last = points[n - 1]?.value ?? 0;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold text-slate-900">
          {prefix}
          {last.toLocaleString()}
        </span>
        <span className="text-xs text-slate-400">peak {prefix}{max.toLocaleString()}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" preserveAspectRatio="none">
        <polygon points={area} fill={color} opacity={0.12} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={2} />
        {axisLabels(points).map((a, i) => (
          <text key={i} x={a.x} y={H - 6} fontSize={10} fill="#94a3b8" textAnchor="middle">
            {a.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function BarChart({
  points,
  color = "#0ea5e9",
}: {
  points: Point[];
  color?: string;
}) {
  const max = niceMax(Math.max(1, ...points.map((p) => p.value)));
  const n = points.length;
  const bw = (W - PAD.left - PAD.right) / n;
  const total = points.reduce((s, p) => s + p.value, 0);

  return (
    <div>
      <span className="text-2xl font-bold text-slate-900">{total.toLocaleString()}</span>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" preserveAspectRatio="none">
        {points.map((p, i) => {
          const h = (p.value / max) * (H - PAD.top - PAD.bottom);
          return (
            <rect
              key={i}
              x={PAD.left + i * bw + bw * 0.15}
              y={H - PAD.bottom - h}
              width={bw * 0.7}
              height={h}
              fill={color}
              rx={1}
            />
          );
        })}
        {axisLabels(points).map((a, i) => (
          <text key={i} x={a.x} y={H - 6} fontSize={10} fill="#94a3b8" textAnchor="middle">
            {a.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
