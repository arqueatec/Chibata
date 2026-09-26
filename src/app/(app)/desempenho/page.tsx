import Link from "next/link";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { TrendChart } from "@/components/TrendChart";
import { Card, Delta, Empty, PageHeader, ProgressBar, ScorePill, Tabs } from "@/components/ui";
import { requireAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { canViewUser } from "@/lib/domain/access";
import {
  formatPeriodTitle,
  formatShortDay,
  isDayKey,
  minKey,
  nextPeriod,
  periodContaining,
  previousPeriod,
  todayKey,
  type PeriodKind,
} from "@/lib/domain/dates";
import { scoreDelta } from "@/lib/domain/scoring";
import { formatScore } from "@/lib/format";
import { loadPerformanceData, periodSeries, scoreUser } from "@/lib/services/performance";

export const metadata = { title: "Desempenho" };
export const dynamic = "force-dynamic";

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; ref?: string; pessoa?: string; comparar?: string }>;
}) {
  const access = await requireAccess();
  const sp = await searchParams;
  const today = todayKey();
  const kind: PeriodKind = sp.periodo === "month" ? "month" : "week";
  const ref = sp.ref && isDayKey(sp.ref) ? minKey(sp.ref, today) : today;
  const period = periodContaining(kind, ref);
  const prev = previousPeriod(period);
  const compare = sp.comparar === "meta" ? "meta" : "area";

  const visibleUsers = await prisma.user.findMany({
    where: { active: true, id: access.visible ? { in: [...access.visible] } : undefined },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const leads = visibleUsers.length > 1;
  const personId = sp.pessoa && canViewUser(access.ctx, sp.pessoa) ? sp.pessoa : leads ? null : access.user.id;

  const series = periodSeries(period, kind === "week" ? 12 : 6);
  const ids = personId ? [personId] : visibleUsers.map((u) => u.id);
  const perf = await loadPerformanceData(ids, series[0].start, minKey(period.end, today));
  const asOf = today;

  const q = (over: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { periodo: kind, ref: period.start, pessoa: personId ?? undefined, comparar: compare, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `/desempenho?${params.toString()}`;
  };
  const label = (p: { start: string }) => (kind === "week" ? formatShortDay(p.start) : MONTHS_SHORT[Number(p.start.slice(5, 7)) - 1]);
  const next = nextPeriod(period);

  return (
    <div className="space-y-4">
      <PageHeader title="Desempenho" subtitle="Notas consolidadas por período, calculadas a partir dos indicadores e check-ins." />
      <Tabs
        current={kind}
        items={[
          { key: "week", label: "Semanal", href: q({ periodo: "week", ref: today }) },
          { key: "month", label: "Mensal", href: q({ periodo: "month", ref: today }) },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link className="btn-secondary btn-sm" href={q({ ref: prev.start })} aria-label="Período anterior">←</Link>
          <span className="font-semibold">{formatPeriodTitle(period)}</span>
          {next.start <= today && <Link className="btn-secondary btn-sm" href={q({ ref: next.start })} aria-label="Próximo período">→</Link>}
        </div>
        {leads && (
          <form action="/desempenho" className="flex gap-2">
            <input type="hidden" name="periodo" value={kind} />
            <input type="hidden" name="ref" value={period.start} />
            <select name="pessoa" defaultValue={personId ?? ""} className="input !w-auto" aria-label="Pessoa">
              <option value="">Toda a equipe</option>
              {visibleUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <button className="btn-secondary btn-sm" type="submit">Ver</button>
          </form>
        )}
      </div>

      {personId ? (
        <PersonView perf={perf} personId={personId} series={series} label={label} asOf={asOf} kind={kind} />
      ) : (
        <TeamView perf={perf} series={series} label={label} asOf={asOf} compare={compare} q={q} />
      )}
    </div>
  );
}

type Perf = Awaited<ReturnType<typeof loadPerformanceData>>;
type Series = ReturnType<typeof periodSeries>;

function PersonView({ perf, personId, series, label, asOf, kind }: { perf: Perf; personId: string; series: Series; label: (p: { start: string }) => string; asOf: string; kind: PeriodKind }) {
  const u = perf.users.find((x) => x.id === personId);
  if (!u) return <Empty>Pessoa não encontrada.</Empty>;
  const results = series.map((p) => scoreUser(perf, personId, p, asOf));
  const current = results.at(-1)!;
  const previous = results.at(-2) ?? null;
  return (
    <>
      <Card
        title={
          <span>
            <Link className="hover:underline" href={`/pessoas/${u.id}`}>{u.name}</Link> <span className="text-sm font-normal text-slate-500">· {u.areaName}</span>
          </span>
        }
        actions={<Delta value={scoreDelta(current?.score ?? null, previous?.score ?? null)} />}
      >
        {current ? <ScoreBreakdown result={current} /> : <Empty>Sem dados.</Empty>}
        {previous?.score !== null && previous && (
          <p className="mt-3 text-xs text-slate-500">
            Período anterior: nota {formatScore(previous.score)} · meta atingida {formatScore(previous.goalAttainment)}% · check-ins {previous.checkinsDone}/{previous.countedBusinessDays}
          </p>
        )}
      </Card>
      <Card title={`Tendência — últimos ${series.length} ${kind === "week" ? "semanas" : "meses"}`}>
        <TrendChart
          labels={series.map(label)}
          series={[
            { name: "Nota", color: "#17706f", values: results.map((r) => r?.score ?? null) },
            { name: "% da meta", color: "#6366f1", values: results.map((r) => r?.goalAttainment ?? null), dashed: true },
            { name: "Regularidade de check-in", color: "#f59e0b", values: results.map((r) => r?.checkinRate ?? null), dashed: true },
          ]}
        />
      </Card>
    </>
  );
}

function TeamView({
  perf,
  series,
  label,
  asOf,
  compare,
  q,
}: {
  perf: Perf;
  series: Series;
  label: (p: { start: string }) => string;
  asOf: string;
  compare: "area" | "meta";
  q: (o: Record<string, string | undefined>) => string;
}) {
  const period = series.at(-1)!;
  const prevPeriod = series.at(-2)!;
  const rows = perf.users.map((u) => {
    const cur = scoreUser(perf, u.id, period, asOf);
    const prev = scoreUser(perf, u.id, prevPeriod, asOf);
    return { u, cur, prev, delta: scoreDelta(cur?.score ?? null, prev?.score ?? null) };
  });
  const palette = ["#17706f", "#6366f1", "#f59e0b", "#ef4444", "#0ea5e9", "#a855f7", "#84cc16", "#64748b"];

  const byArea = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.u.areaName ?? "Sem área";
    byArea.set(k, [...(byArea.get(k) ?? []), r]);
  }

  return (
    <>
      <Tabs
        current={compare}
        items={[
          { key: "area", label: "Comparar dentro da área", href: q({ comparar: "area" }) },
          { key: "meta", label: "Por % de meta atingida", href: q({ comparar: "meta" }) },
        ]}
      />
      {compare === "area" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...byArea.entries()].map(([area, list]) => (
            <Card key={area} title={area}>
              <ol className="space-y-3">
                {[...list]
                  .sort((a, b) => (b.cur?.score ?? -1) - (a.cur?.score ?? -1))
                  .map((r, i) => (
                    <li key={r.u.id} className="flex items-center justify-between gap-2">
                      <div>
                        {list.length > 1 && <span className="mr-1 text-slate-400">{i + 1}.</span>}
                        <Link href={q({ pessoa: r.u.id })} className="font-medium hover:underline">{r.u.name}</Link>
                        <div className="text-xs"><Delta value={r.delta} /></div>
                      </div>
                      <ScorePill value={r.cur?.score} />
                    </li>
                  ))}
              </ol>
              {list.length === 1 && <p className="mt-2 text-xs text-slate-500">Única pessoa na área: compare com o período anterior ou use a visão por % de meta.</p>}
            </Card>
          ))}
        </div>
      ) : (
        <Card title="Percentual de meta atingida">
          <p className="mb-3 text-xs text-slate-500">
            Como as áreas têm métricas diferentes, pessoas de áreas distintas só são comparadas pelo percentual ponderado de atingimento das próprias metas.
          </p>
          <ul className="space-y-3">
            {[...rows]
              .sort((a, b) => (b.cur?.goalAttainment ?? -1) - (a.cur?.goalAttainment ?? -1))
              .map((r) => (
                <li key={r.u.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>
                      <Link href={q({ pessoa: r.u.id })} className="font-medium hover:underline">{r.u.name}</Link>
                      <span className="text-xs text-slate-500"> · {r.u.areaName}</span>
                    </span>
                    <span className="font-semibold">{formatScore(r.cur?.goalAttainment)}%</span>
                  </div>
                  <ProgressBar value={r.cur?.goalAttainment ?? null} />
                </li>
              ))}
          </ul>
        </Card>
      )}
      <Card title="Tendência da nota por pessoa">
        <TrendChart
          labels={series.map(label)}
          series={perf.users.map((u, i) => ({
            name: u.name,
            color: palette[i % palette.length],
            values: series.map((p) => scoreUser(perf, u.id, p, asOf)?.score ?? null),
          }))}
        />
      </Card>
    </>
  );
}
