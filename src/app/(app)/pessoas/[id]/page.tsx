import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditList } from "@/components/AuditList";
import { FeedbackForm } from "@/components/FeedbackForm";
import { FeedbackList } from "@/components/FeedbackList";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { TaskList } from "@/components/TaskList";
import { TrendChart } from "@/components/TrendChart";
import { Badge, Card, Delta, Empty, PageHeader, ScorePill, Stat, Tabs } from "@/components/ui";
import { requireAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { canEditCheckIn, canGiveFeedback, canViewUser } from "@/lib/domain/access";
import { missingCheckinStreak } from "@/lib/domain/alerts";
import {
  addDays,
  addMonths,
  businessDaysInRange,
  dateToKey,
  formatDay,
  formatShortDay,
  keyToDate,
  periodContaining,
  startOfMonth,
  todayKey,
  type Period,
} from "@/lib/domain/dates";
import { scoreDelta } from "@/lib/domain/scoring";
import { formatScore, formatValue, ROLE_LABEL } from "@/lib/format";
import { loadPerformanceData, periodSeries, scoreUser } from "@/lib/services/performance";

export const dynamic = "force-dynamic";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ periodo?: string }> }) {
  const access = await requireAccess();
  const { id } = await params;
  const sp = await searchParams;
  // Sem permissão = 404 (não revela a existência da pessoa)
  if (!canViewUser(access.ctx, id)) notFound();
  const person = await prisma.user.findUnique({ where: { id }, include: { area: true, manager: { select: { id: true, name: true } } } });
  if (!person) notFound();

  const today = todayKey();
  const kind = sp.periodo === "month" ? "month" : "week";
  const current = periodContaining(kind, today);
  const weeks = periodSeries(periodContaining("week", today), 12);
  const from = weeks[0].start < addMonths(startOfMonth(today), -1) ? weeks[0].start : addMonths(startOfMonth(today), -1);
  const perf = await loadPerformanceData([id], from, today);

  const [checkIns, tasks, feedbacks, reviews, auditRows] = await Promise.all([
    prisma.checkIn.findMany({
      where: { userId: id },
      orderBy: { date: "desc" },
      take: 30,
      include: { feedbacks: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" } } },
    }),
    prisma.task.findMany({
      where: { assigneeId: id, OR: [{ status: { not: "DONE" } }, { completedAt: { gte: keyToDate(addDays(today, -14)) } }] },
      include: { assignee: { select: { id: true, name: true } }, project: { select: { name: true, kind: true } }, _count: { select: { children: true } } },
      orderBy: [{ kind: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }],
    }),
    prisma.feedback.findMany({
      where: { targetUserId: id },
      include: { author: { select: { name: true } }, checkIn: { select: { date: true } }, task: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.monthlyReview.findMany({ where: { userId: id }, orderBy: { month: "desc" }, take: 12 }),
    prisma.auditLog.findMany({ where: { subjectUserId: id }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);

  const week = scoreUser(perf, id, periodContaining("week", today), today);
  const prevWeek = scoreUser(perf, id, periodContaining("week", addDays(today, -7)), today);
  const month = scoreUser(perf, id, periodContaining("month", today), today);
  const prevMonth = scoreUser(perf, id, periodContaining("month", addMonths(today, -1)), today);
  const breakdown = kind === "week" ? week : month;
  const weekResults = weeks.map((w) => scoreUser(perf, id, w, today));
  const allCi = perf.checkIns.get(id) ?? [];
  const streak = missingCheckinStreak(allCi, today, dateToKey(person.createdAt));
  const canFeedback = canGiveFeedback(access.ctx, id);
  const u = perf.users[0];

  // Autoavaliação média por semana (1-5 → 0-100 para o gráfico)
  const selfAvg = await selfScoreSeries(id, weeks);

  // Histórico de indicadores: últimos 10 dias úteis
  const days = businessDaysInRange(addDays(today, -16), today).slice(-10);
  const entries = perf.entries.get(id) ?? [];
  const valueOf = (indId: string, d: string) => entries.find((e) => e.indicatorId === indId && e.date === d)?.value;

  const months: string[] = [];
  for (let i = 0; i < 6; i++) months.push(addMonths(startOfMonth(today), -i));

  return (
    <div className="space-y-4">
      <PageHeader
        title={person.name}
        subtitle={
          <>
            {person.jobTitle ?? person.area?.name} · {person.area?.name} · {ROLE_LABEL[person.role]}
            {person.manager && <> · reporta a {person.manager.name}</>}
            {!person.active && <Badge tone="red">inativo</Badge>}
          </>
        }
        actions={
          <>
            {access.user.id === id && <Link className="btn-primary btn-sm" href="/checkin">Fazer check-in</Link>}
            {access.isAdmin && <Link className="btn-secondary btn-sm" href={`/checkin?user=${id}`}>Editar check-ins (admin)</Link>}
            {access.user.id === id && <Link className="btn-secondary btn-sm" href="/meus-dados">Meus dados / exportar</Link>}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Nota da semana" value={<ScorePill value={week?.score} />} hint={<Delta value={scoreDelta(week?.score ?? null, prevWeek?.score ?? null)} />} />
        <Stat label="Nota do mês" value={<ScorePill value={month?.score} />} hint={<Delta value={scoreDelta(month?.score ?? null, prevMonth?.score ?? null)} />} />
        <Stat label="Meta atingida (mês)" value={`${formatScore(month?.goalAttainment)}%`} />
        <Stat label="Dias sem check-in" value={streak} hint={streak >= 3 ? "⚠ alerta" : "dias úteis consecutivos"} />
      </div>

      <Card title="Evolução — últimas 12 semanas">
        <TrendChart
          labels={weeks.map((w) => formatShortDay(w.start))}
          series={[
            { name: "Nota", color: "#2e3d44", values: weekResults.map((r) => r?.score ?? null) },
            { name: "% da meta", color: "#2a8a91", values: weekResults.map((r) => r?.goalAttainment ?? null), dashed: true },
            { name: "Autoavaliação (×20)", color: "#f59e0b", values: selfAvg, dashed: true },
          ]}
        />
      </Card>

      <Card title="Como a nota é calculada">
        <Tabs
          current={kind}
          items={[
            { key: "week", label: "Semana atual", href: `/pessoas/${id}?periodo=week` },
            { key: "month", label: "Mês atual", href: `/pessoas/${id}?periodo=month` },
          ]}
        />
        {breakdown ? <ScoreBreakdown result={breakdown} /> : <Empty>Sem dados.</Empty>}
        <p className="mt-2 text-xs text-slate-500">Período: {formatDay(current.start)} a {formatDay(current.end)}. <Link className="link" href={`/desempenho?pessoa=${id}&periodo=${kind}`}>Ver períodos anteriores</Link></p>
      </Card>

      {u && u.indicators.length > 0 && (
        <Card title="Indicadores — últimos 10 dias úteis">
          <div className="-mx-2 overflow-x-auto">
            <table className="tbl text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white">Indicador</th>
                  {days.map((d) => (
                    <th key={d} className="text-right">{formatShortDay(d)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {u.indicators.map((ind) => (
                  <tr key={ind.id}>
                    <td className="sticky left-0 bg-white font-medium">{ind.name}</td>
                    {days.map((d) => {
                      const v = valueOf(ind.id, d);
                      return <td key={d} className={`text-right ${v === undefined ? "text-slate-300" : ""}`}>{v === undefined ? "·" : formatValue(v, ind.unit === "CURRENCY" ? "COUNT" : ind.unit)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Metas e tarefas">
        <TaskList tasks={tasks} today={today} showAssignee={false} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Histórico de check-ins">
          <ul className="space-y-3">
            {checkIns.map((c) => {
              const k = dateToKey(c.date);
              const editable = canEditCheckIn(access.ctx, id, k, today).allowed;
              return (
                <li key={c.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{formatDay(k, true)}</span>
                    <span className="flex items-center gap-1">
                      <Badge tone="brand">autoavaliação {c.selfScore}/5</Badge>
                      {editable && <Link className="link text-xs" href={`/checkin?date=${k}${access.user.id !== id ? `&user=${id}` : ""}`}>editar</Link>}
                    </span>
                  </div>
                  <p><span className="text-slate-500">Feito:</span> {c.yesterday}</p>
                  <p><span className="text-slate-500">Plano:</span> {c.today}</p>
                  {c.blockers && (
                    <p className={`mt-1 ${c.blockerResolvedAt ? "text-slate-500" : "text-red-700"}`}>
                      <span>{c.blockerResolvedAt ? "✓ Bloqueio (resolvido):" : "⚠ Bloqueio:"}</span> {c.blockers} {c.needsHelp && !c.blockerResolvedAt && <Badge tone="red">pediu ajuda</Badge>}
                    </p>
                  )}
                  {c.feedbacks.map((f) => (
                    <p key={f.id} className="mt-2 rounded bg-slate-50 p-2 text-xs">
                      <strong>{f.author.name}{f.kind === "RECOGNITION" ? " ⭐" : ""}:</strong> {f.body}
                    </p>
                  ))}
                  {canFeedback && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-accent-700">Comentar este dia</summary>
                      <div className="mt-2"><FeedbackForm targetUserId={id} checkInId={c.id} compact /></div>
                    </details>
                  )}
                </li>
              );
            })}
            {checkIns.length === 0 && <Empty>Nenhum check-in registrado.</Empty>}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card title="Feedbacks recebidos">
            <div id="feedbacks" />
            {canFeedback && (
              <div className="mb-4 space-y-2">
                <p className="text-xs text-slate-500">Feedback sobre a semana atual (para dia ou tarefa, use os respectivos registros).</p>
                <FeedbackForm targetUserId={id} periodType="WEEK" periodStart={today} />
              </div>
            )}
            <FeedbackList items={feedbacks} />
          </Card>

          <Card title="Revisões mensais">
            <ul className="divide-y divide-slate-100 text-sm">
              {months.map((m) => {
                const r = reviews.find((x) => dateToKey(x.month) === m);
                const [y, mm] = m.split("-").map(Number);
                return (
                  <li key={m} className="flex items-center justify-between py-2">
                    <Link href={`/pessoas/${id}/revisao/${m.slice(0, 7)}`} className="link capitalize">{MONTHS[mm - 1]} de {y}</Link>
                    <span className="flex items-center gap-2">
                      {r?.finalScore !== null && r?.finalScore !== undefined && <ScorePill value={r.finalScore} />}
                      {r ? <Badge tone={r.status === "FINALIZED" ? "green" : "yellow"}>{r.status === "FINALIZED" ? "finalizada" : "rascunho"}</Badge> : <Badge>não iniciada</Badge>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>

      <Card title="Registros de auditoria sobre esta pessoa">
        <p className="mb-2 text-xs text-slate-500">Transparência: tudo o que é criado, editado ou excluído sobre {access.user.id === id ? "você" : person.name} fica registrado aqui.</p>
        <AuditList items={auditRows} />
      </Card>
    </div>
  );
}

async function selfScoreSeries(userId: string, weeks: Period[]) {
  const rows = await prisma.checkIn.findMany({
    where: { userId, date: { gte: keyToDate(weeks[0].start), lte: keyToDate(weeks.at(-1)!.end) } },
    select: { date: true, selfScore: true },
  });
  return weeks.map((w) => {
    const xs = rows.filter((r) => dateToKey(r.date) >= w.start && dateToKey(r.date) <= w.end).map((r) => r.selfScore);
    return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 20) : null;
  });
}
