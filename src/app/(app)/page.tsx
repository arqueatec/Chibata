import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { FeedbackList } from "@/components/FeedbackList";
import { TaskList } from "@/components/TaskList";
import { Badge, Card, Delta, Empty, PageHeader, ProgressBar, ScorePill, Stat } from "@/components/ui";
import { resolveBlocker } from "@/app/actions/checkin";
import { requireAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { dateToKey, formatDay, formatPeriod, formatShortDay, isBusinessDay, todayKey } from "@/lib/domain/dates";
import { scoreDelta } from "@/lib/domain/scoring";
import { formatScore } from "@/lib/format";
import { teamDashboard } from "@/lib/services/dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const access = await requireAccess();
  const today = todayKey();
  const leads = access.isAdmin || access.ctx.subordinates.size > 0;

  const teamIds = leads
    ? (await prisma.user.findMany({ where: { active: true, id: access.visible ? { in: [...access.visible] } : undefined }, select: { id: true } })).map((u) => u.id)
    : [access.user.id];
  const dash = await teamDashboard(teamIds, today);
  const me = dash.people.find((p) => p.id === access.user.id);

  const [myTasks, myFeedback] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: access.user.id, status: { not: "DONE" } },
      include: { assignee: { select: { id: true, name: true } }, project: { select: { name: true, kind: true } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      take: 8,
    }),
    prisma.feedback.findMany({
      where: { targetUserId: access.user.id },
      include: { author: { select: { name: true } }, checkIn: { select: { date: true } }, task: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
  ]);

  const team = dash.people.filter((p) => leads && (access.isAdmin || p.id !== access.user.id));
  const doneToday = team.filter((p) => p.checkedInToday).length;

  return (
    <div className="space-y-5">
      <PageHeader title={`Olá, ${access.user.name}!`} subtitle={`${formatDay(today, true)} · ${formatPeriod(dash.week)}`} />

      {/* Meu dia */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Meu check-in de hoje"
          value={me?.checkedInToday ? <span className="text-emerald-700">Feito ✓</span> : <span className="text-amber-700">{isBusinessDay(today) ? "Pendente" : "Opcional"}</span>}
          hint={me?.checkedInToday ? "Editar check-in" : "Leva menos de 3 minutos"}
          href="/checkin"
        />
        <Stat label="Minha nota da semana" value={<ScorePill value={me?.week?.score} />} hint={<Delta value={scoreDelta(me?.week?.score ?? null, me?.prevWeek?.score ?? null)} />} href={`/desempenho?pessoa=${access.user.id}`} />
        <Stat label="Meta atingida (semana)" value={`${formatScore(me?.week?.goalAttainment)}%`} hint={`Mês: ${formatScore(me?.month?.goalAttainment)}%`} href={`/pessoas/${access.user.id}`} />
        <Stat label="Minhas tarefas abertas" value={myTasks.length} hint={`${myTasks.filter((t) => t.dueDate && dateToKey(t.dueDate) < today).length} atrasada(s)`} href="/tarefas" />
      </div>

      {leads && (
        <>
          <h2 className="pt-2 text-lg font-bold">{access.isAdmin ? "Equipe hoje" : "Minha equipe hoje"}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Check-ins hoje" value={`${doneToday}/${team.length}`} hint={isBusinessDay(today) ? "dia útil" : "fim de semana"} />
            <Stat label="Bloqueios abertos" value={dash.openBlockers.filter((b) => team.some((p) => p.id === b.userId)).length + dash.blockedTasks.filter((t) => team.some((p) => p.id === t.assigneeId)).length} hint="check-ins + tarefas bloqueadas" />
            <Stat label="Tarefas atrasadas" value={dash.overdueTasks.filter((t) => team.some((p) => p.id === t.assigneeId)).length} href="/tarefas" />
            <Stat label="Alertas" value={dash.alerts.length} />
          </div>

          {dash.alerts.length > 0 && (
            <Card title="Alertas">
              <ul className="space-y-2">
                {dash.alerts.map((a, i) => (
                  <li key={i}>
                    <Link href={a.href} className={`flex items-start gap-2 rounded-lg p-2 text-sm hover:opacity-90 ${a.severity === "high" ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>
                      <span aria-hidden>{a.severity === "high" ? "⛔" : "⚠"}</span>
                      {a.text}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Quem já fez o check-in">
              <ul className="divide-y divide-slate-100">
                {team.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <Link href={`/pessoas/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                      <div className="text-xs text-slate-500">{p.areaName}</div>
                    </div>
                    <div className="text-right">
                      {p.checkedInToday ? (
                        <Badge tone="green">feito</Badge>
                      ) : (
                        <Badge tone={p.missingStreak >= 3 ? "red" : "yellow"}>pendente</Badge>
                      )}
                      <div className="mt-0.5 text-xs text-slate-500">
                        {p.lastCheckIn ? `último: ${formatShortDay(p.lastCheckIn)}` : "nenhum registro"}
                        {p.missingStreak > 0 && ` · ${p.missingStreak} dia(s) útil(eis) sem`}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card title="Bloqueios e pedidos de ajuda">
              {dash.openBlockers.length === 0 && dash.blockedTasks.length === 0 ? (
                <Empty>Nenhum bloqueio aberto. 🎉</Empty>
              ) : (
                <ul className="space-y-2">
                  {dash.openBlockers.map((b) => (
                    <li key={b.id} className={`rounded-lg border p-2 text-sm ${b.needsHelp ? "border-red-200 bg-red-50" : "border-slate-200"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          <Link href={`/pessoas/${b.user.id}`} className="hover:underline">{b.user.name}</Link>
                          <span className="font-normal text-slate-500"> · {formatShortDay(dateToKey(b.date))}</span>
                          {b.needsHelp && <Badge tone="red">pediu ajuda</Badge>}
                        </span>
                        <ActionForm action={resolveBlocker} className="">
                          <input type="hidden" name="id" value={b.id} />
                          <SubmitButton className="btn-secondary btn-sm" pendingText="…">Resolvido</SubmitButton>
                        </ActionForm>
                      </div>
                      <p className="mt-1 text-slate-700">{b.blockers}</p>
                    </li>
                  ))}
                  {dash.blockedTasks.map((t) => (
                    <li key={t.id} className="rounded-lg border border-slate-200 p-2 text-sm">
                      <span className="font-medium">{t.assignee.name}</span> · tarefa bloqueada:{" "}
                      <Link href={`/tarefas/${t.id}`} className="link">{t.title}</Link>
                      {t.blockedReason && <p className="mt-1 text-slate-600">{t.blockedReason}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title="Progresso das metas por pessoa (semana atual)">
            <div className="-mx-2 overflow-x-auto">
              <table className="tbl min-w-[560px]">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th className="w-40">Meta atingida (semana)</th>
                    <th className="text-right">Nota semana</th>
                    <th className="text-right">Variação</th>
                    <th className="text-right">Nota mês</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/pessoas/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                        <div className="text-xs text-slate-500">{p.areaName}</div>
                      </td>
                      <td>
                        <ProgressBar value={p.week?.goalAttainment ?? null} />
                        <div className="mt-0.5 text-xs text-slate-600">{formatScore(p.week?.goalAttainment)}%</div>
                      </td>
                      <td className="text-right"><ScorePill value={p.week?.score} /></td>
                      <td className="text-right"><Delta value={scoreDelta(p.week?.score ?? null, p.prevWeek?.score ?? null)} /></td>
                      <td className="text-right"><ScorePill value={p.month?.score} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">Semana em andamento: metas proporcionais aos dias úteis decorridos. Variação comparada à semana anterior completa.</p>
          </Card>

          {dash.areas.length > 1 && (
            <Card title="Progresso por área">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {dash.areas.map((a) => (
                  <div key={a.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{a.name}</span>
                      <ScorePill value={a.weekScore} />
                    </div>
                    <div className="mt-2"><ProgressBar value={a.weekGoal} /></div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatScore(a.weekGoal)}% da meta na semana · mês {formatScore(a.monthScore)} · {a.count} pessoa(s)
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {dash.overdueTasks.length > 0 && (
            <Card title={<span className="text-red-800">Tarefas atrasadas</span>}>
              <TaskList tasks={dash.overdueTasks} today={today} />
            </Card>
          )}
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Minhas tarefas" actions={<Link href="/tarefas" className="link text-sm">ver todas</Link>}>
          <TaskList tasks={myTasks} today={today} showAssignee={false} />
        </Card>
        <Card title="Feedbacks recentes para mim" actions={<Link href={`/pessoas/${access.user.id}#feedbacks`} className="link text-sm">ver todos</Link>}>
          <FeedbackList items={myFeedback} />
        </Card>
      </div>
    </div>
  );
}
