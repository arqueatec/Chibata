import "server-only";
import { prisma } from "@/lib/db";
import { missingCheckinStreak, MISSING_CHECKIN_ALERT_DAYS, weeklyProgressAlerts, type WeeklyProgressAlert } from "@/lib/domain/alerts";
import { addDays, dateToKey, keyToDate, minKey, periodContaining, previousPeriod, type DayKey } from "@/lib/domain/dates";
import type { ScoreResult } from "@/lib/domain/scoring";
import { loadPerformanceData, scoreUser } from "./performance";

export interface PersonRow {
  id: string;
  name: string;
  jobTitle: string | null;
  areaId: string | null;
  areaName: string | null;
  checkedInToday: boolean;
  lastCheckIn: DayKey | null;
  missingStreak: number;
  week: ScoreResult | null;
  prevWeek: ScoreResult | null;
  month: ScoreResult | null;
  weeklyAlerts: WeeklyProgressAlert[];
}

export interface Alert {
  severity: "high" | "medium";
  text: string;
  href: string;
}

export async function teamDashboard(userIds: string[], today: DayKey) {
  const week = periodContaining("week", today);
  const prevWeek = previousPeriod(week);
  const month = periodContaining("month", today);
  const from = minKey(minKey(prevWeek.start, month.start), addDays(today, -60));
  const perf = await loadPerformanceData(userIds, from, today);

  const people: PersonRow[] = perf.users.map((u) => {
    const cis = perf.checkIns.get(u.id) ?? [];
    const sorted = [...cis].sort();
    return {
      id: u.id,
      name: u.name,
      jobTitle: u.jobTitle,
      areaId: u.areaId,
      areaName: u.areaName,
      checkedInToday: cis.includes(today),
      lastCheckIn: sorted.at(-1) ?? null,
      missingStreak: missingCheckinStreak(cis, today, u.createdAt),
      week: scoreUser(perf, u.id, week, today),
      prevWeek: scoreUser(perf, u.id, prevWeek, today),
      month: scoreUser(perf, u.id, month, today),
      weeklyAlerts: weeklyProgressAlerts(u.indicators, perf.entries.get(u.id) ?? [], today),
    };
  });

  const [openBlockers, blockedTasks, overdueTasks] = await Promise.all([
    prisma.checkIn.findMany({
      where: { userId: { in: userIds }, blockers: { not: null }, blockerResolvedAt: null, date: { gte: keyToDate(addDays(today, -30)) } },
      include: { user: { select: { id: true, name: true } } },
      orderBy: [{ needsHelp: "desc" }, { date: "asc" }],
    }),
    prisma.task.findMany({
      where: { assigneeId: { in: userIds }, status: "BLOCKED" },
      include: { assignee: { select: { id: true, name: true } }, project: { select: { name: true, kind: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.task.findMany({
      where: { assigneeId: { in: userIds }, status: { notIn: ["DONE"] }, dueDate: { lt: keyToDate(today) } },
      include: { assignee: { select: { id: true, name: true } }, project: { select: { name: true, kind: true } } },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const alerts: Alert[] = [];
  for (const p of people) {
    if (p.missingStreak >= MISSING_CHECKIN_ALERT_DAYS) {
      alerts.push({ severity: "high", text: `${p.name} está há ${p.missingStreak} dias úteis sem check-in.`, href: `/pessoas/${p.id}` });
    }
    for (const w of p.weeklyAlerts) {
      alerts.push({
        severity: "medium",
        text: `${p.name}: “${w.indicatorName}” em ${Math.round(w.progress * 100)}% da meta semanal (${w.actual.toLocaleString("pt-BR")} de ${w.weekTarget.toLocaleString("pt-BR")}).`,
        href: `/pessoas/${p.id}`,
      });
    }
  }
  for (const b of openBlockers) {
    const age = (keyToDate(today).getTime() - b.date.getTime()) / 86400_000;
    if (b.needsHelp && age >= 2) {
      alerts.push({ severity: "high", text: `${b.user.name} pediu ajuda há ${Math.round(age)} dias e o bloqueio segue aberto.`, href: `/pessoas/${b.user.id}` });
    }
  }
  const overdueByPerson = new Map<string, { name: string; count: number }>();
  for (const t of overdueTasks) {
    const cur = overdueByPerson.get(t.assigneeId) ?? { name: t.assignee.name, count: 0 };
    cur.count++;
    overdueByPerson.set(t.assigneeId, cur);
  }
  for (const [id, v] of overdueByPerson) {
    if (v.count >= 2) alerts.push({ severity: "medium", text: `${v.name} tem ${v.count} tarefas atrasadas.`, href: `/tarefas?pessoa=${id}` });
  }
  alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));

  // Consolidação por área
  const areaMap = new Map<string, { name: string; people: PersonRow[] }>();
  for (const p of people) {
    const key = p.areaId ?? "sem-area";
    const cur = areaMap.get(key) ?? { name: p.areaName ?? "Sem área", people: [] };
    cur.people.push(p);
    areaMap.set(key, cur);
  }
  const avg = (xs: (number | null | undefined)[]) => {
    const v = xs.filter((x): x is number => typeof x === "number");
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  };
  const areas = [...areaMap.entries()].map(([id, a]) => ({
    id,
    name: a.name,
    count: a.people.length,
    weekScore: avg(a.people.map((p) => p.week?.score)),
    weekGoal: avg(a.people.map((p) => p.week?.goalAttainment)),
    monthScore: avg(a.people.map((p) => p.month?.score)),
  }));

  return { week, month, people, openBlockers, blockedTasks, overdueTasks, alerts, areas };
}

export function checkInKey(d: Date) {
  return dateToKey(d);
}
