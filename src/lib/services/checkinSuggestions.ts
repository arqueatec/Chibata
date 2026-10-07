import "server-only";
import { prisma } from "@/lib/db";
import { addDays, dateToKey, formatShortDay, keyToDate, type DayKey } from "@/lib/domain/dates";

/**
 * Sugestões para o check-in a partir das tarefas da pessoa (sincronizadas do Asana ou criadas no app):
 * o que foi concluído desde o último check-in, o que está previsto para hoje e o que está bloqueado.
 */
export async function checkInSuggestions(userId: string, today: DayKey, previousCheckInAt: Date | null) {
  const since = previousCheckInAt ?? new Date(Date.now() - 3 * 86400_000);
  const [done, open] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: userId, status: "DONE", completedAt: { gt: since } },
      orderBy: { completedAt: "asc" },
      take: 10,
      select: { title: true },
    }),
    prisma.task.findMany({
      where: {
        assigneeId: userId,
        status: { not: "DONE" },
        OR: [{ status: { in: ["IN_PROGRESS", "BLOCKED"] } }, { dueDate: { lte: keyToDate(addDays(today, 1)) } }],
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      take: 12,
      select: { title: true, status: true, dueDate: true, blockedReason: true, asanaGid: true },
    }),
  ]);
  const plan = open
    .filter((t) => t.status !== "BLOCKED")
    .slice(0, 8)
    .map((t) => {
      const due = t.dueDate ? dateToKey(t.dueDate) : null;
      const when = !due ? "" : due < today ? ` (atrasada, prazo ${formatShortDay(due)})` : due === today ? " (vence hoje)" : ` (prazo ${formatShortDay(due)})`;
      return `• ${t.title}${when}`;
    });
  const blocked = open.filter((t) => t.status === "BLOCKED").map((t) => ({ title: t.title, reason: t.blockedReason }));
  return { done: done.map((t) => `✓ ${t.title}`), plan, blocked };
}
