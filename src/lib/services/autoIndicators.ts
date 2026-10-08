import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeAutoValue, isCrmRule, parseAutoRule, type AutoCrmEvent, type AutoFieldChange, type AutoTask } from "@/lib/domain/autoIndicators";
import { addDays, eachDay, keyToDate, maxKey, todayKey } from "@/lib/domain/dates";

/** Dia (fuso do app) de um instante. */
const dayOf = (d: Date) => todayKey(d);

export const AUTO_WINDOW_DAYS = 35;

/**
 * Recalcula os lançamentos dos indicadores automáticos para os últimos dias.
 * Lançamentos automáticos substituem os manuais do mesmo dia; zeros não são gravados.
 * Retorna quantos lançamentos foram criados/atualizados/removidos.
 */
export async function recomputeAutoIndicators(opts: { userIds?: string[]; days?: number } = {}) {
  const today = todayKey();
  const from = addDays(today, -((opts.days ?? AUTO_WINDOW_DAYS) - 1));
  const indicators = (
    await prisma.indicator.findMany({ where: { active: true, autoRule: { not: Prisma.AnyNull } } })
  )
    .map((i) => ({ ...i, rule: parseAutoRule(i.autoRule) }))
    .filter((i) => i.rule !== null);
  if (indicators.length === 0) return { upserted: 0, removed: 0 };

  const users = await prisma.user.findMany({
    where: { active: true, ...(opts.userIds ? { id: { in: opts.userIds } } : {}) },
    select: { id: true, areaId: true, createdAt: true, email: true, crmEmails: true },
  });
  const userIds = users.map((u) => u.id);
  const needsCrm = indicators.some((i) => isCrmRule(i.rule!.type));
  const [tasks, changes, crmRows] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: { in: userIds } },
      select: { assigneeId: true, projectId: true, title: true, createdAt: true, dueDate: true, completedAt: true, status: true, asanaFields: true },
    }),
    prisma.taskFieldChange.findMany({
      where: { changedAt: { gte: keyToDate(addDays(from, -1)) }, task: { assigneeId: { in: userIds } } },
      include: { task: { select: { assigneeId: true, projectId: true, title: true } } },
    }),
    needsCrm ? prisma.crmEvent.findMany({ where: { day: { gte: keyToDate(from) } } }) : Promise.resolve([]),
  ]);
  const crmEvents: AutoCrmEvent[] = crmRows.map((e) => ({
    type: e.type as AutoCrmEvent["type"],
    day: e.day.toISOString().slice(0, 10),
    segment: e.segment,
    userEmail: e.userEmail,
    toStatus: e.toStatus,
    volumeL: e.volumeL,
    amount: e.amount,
  }));
  const autoTasks: AutoTask[] = tasks.map((t) => ({
    assigneeId: t.assigneeId,
    projectId: t.projectId,
    title: t.title,
    createdOn: dayOf(t.createdAt),
    dueOn: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    completedOn: t.status === "DONE" && t.completedAt ? dayOf(t.completedAt) : null,
    fields: (t.asanaFields ?? {}) as Record<string, string | number | null>,
  }));
  const autoChanges: AutoFieldChange[] = changes.map((c) => ({
    assigneeId: c.task.assigneeId,
    projectId: c.task.projectId,
    title: c.task.title,
    field: c.field,
    toValue: c.toValue,
    on: dayOf(c.changedAt),
  }));

  let upserted = 0;
  let removed = 0;
  for (const ind of indicators) {
    const targets = users.filter((u) => (ind.ownerId ? u.id === ind.ownerId : ind.areaId && u.areaId === ind.areaId));
    for (const u of targets) {
      const start = maxKey(from, dayOf(u.createdAt));
      const existing = await prisma.indicatorEntry.findMany({
        where: { indicatorId: ind.id, userId: u.id, date: { gte: keyToDate(start), lte: keyToDate(today) } },
      });
      for (const day of eachDay(start, today)) {
        const value = computeAutoValue({
          rule: ind.rule!,
          userId: u.id,
          day,
          today,
          tasks: autoTasks,
          changes: autoChanges,
          crmEvents,
          crmEmails: [u.email, ...u.crmEmails],
        });
        if (value === null) continue; // não calculável para este dia: mantém o que existe
        const prev = existing.find((e) => e.date.toISOString().slice(0, 10) === day);
        if (value === 0 && ind.rule!.type !== "FIELD_SUM") {
          if (prev) {
            await prisma.indicatorEntry.delete({ where: { id: prev.id } });
            removed++;
          }
          continue;
        }
        if (prev && prev.value === value && prev.source === "AUTO") continue;
        await prisma.indicatorEntry.upsert({
          where: { indicatorId_userId_date: { indicatorId: ind.id, userId: u.id, date: keyToDate(day) } },
          create: { indicatorId: ind.id, userId: u.id, date: keyToDate(day), value, source: "AUTO" },
          update: { value, source: "AUTO" },
        });
        upserted++;
      }
    }
  }
  return { upserted, removed };
}
