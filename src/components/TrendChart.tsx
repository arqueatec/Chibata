/** Gráfico de linha em SVG puro (renderizado no servidor, sem dependências). */
export interface Series {
  name: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

export function TrendChart({ labels, series, max = 100, height = 180, suffix = "" }: { labels: string[]; series: Series[]; max?: number; height?: number; suffix?: string }) {
  const W = 640;
  const H = height;
  const pad = { l: 34, r: 10, t: 10, b: 26 };
  const n = labels.length;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v: number) => pad.t + (1 - Math.min(v, max) / max) * (H - pad.t - pad.b);
  const ticks = [0, 25, 50, 75, 100].map((t) => (t / 100) * max);
  const every = Math.ceil(n / 8);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Gráfico de tendência: ${series.map((s) => s.name).join(", ")}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeDasharray={t === 0 ? undefined : "3 3"} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#64748b">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === n - 1 && n > 1 ? "end" : i === 0 ? "start" : "middle"} fontSize="10" fill="#64748b">
              {l}
            </text>
          ) : null,
        )}
        {series.map((s) => {
          const segments: string[] = [];
          let cur = "";
          s.values.forEach((v, i) => {
            if (v === null) {
              if (cur) segments.push(cur);
              cur = "";
            } else cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
          });
          if (cur) segments.push(cur);
          return (
            <g key={s.name}>
              {segments.map((d, i) => (
                <path key={i} d={d} fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" />
              ))}
              {s.values.map((v, i) =>
                v === null ? null : (
                  <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="#fff" stroke={s.color} strokeWidth="2">
                    <title>{`${s.name} — ${labels[i]}: ${v.toLocaleString("pt-BR")}${suffix}`}</title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <figcaption className="mt-1 flex flex-wrap gap-3 text-xs text-slate-600">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-4" style={{ background: s.color }} /> {s.name}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
