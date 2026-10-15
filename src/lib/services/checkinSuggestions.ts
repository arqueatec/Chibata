import "server-only";
import { prisma } from "@/lib/db";
import { addDays, dateToKey, formatShortDay, keyToDate, todayKey, type DayKey } from "@/lib/domain/dates";

/**
 * Sugestões para o check-in do dia `today` (o check-in é feito no fim do dia, sobre o próprio dia):
 * o que foi concluído no dia (tarefas do Asana/app e contatos/vendas do CRM) e o que está bloqueado.
 */
export async function checkInSuggestions(userId: string, today: DayKey, crmEmails: string[] = []) {
  // Janela folgada (o dia no fuso do app cai entre dois dias UTC); o filtro exato é feito abaixo
  const from = new Date(`${addDays(today, -1)}T00:00:00.000Z`);
  const to = new Date(`${addDays(today, 2)}T00:00:00.000Z`);
  const emails = crmEmails.map((e) => e.toLowerCase());
  const [doneRaw, open, crmContacts, crmSales, crmActions] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: userId, status: "DONE", completedAt: { gte: from, lt: to } },
      orderBy: { completedAt: "asc" },
      take: 30,
      select: { title: true, completedAt: true },
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
    // CRM: contatos e vendas registrados pela pessoa no dia
    emails.length
      ? prisma.crmEvent.findMany({ where: { type: "CONTACT", userEmail: { in: emails }, day: keyToDate(today) }, orderBy: { at: "asc" }, take: 8 })
      : Promise.resolve([]),
    emails.length
      ? prisma.crmEvent.findMany({ where: { type: "SALE", userEmail: { in: emails }, day: keyToDate(today) }, orderBy: { at: "asc" }, take: 5 })
      : Promise.resolve([]),
    // CRM: próximas ações das contas sob responsabilidade da pessoa, vencidas ou até amanhã
    emails.length
      ? prisma.crmAccount.findMany({
          where: { ownerEmail: { in: emails }, nextActionDate: { lte: keyToDate(addDays(today, 1)) }, NOT: [{ status: { startsWith: "11." } }, { status: { startsWith: "12." } }] },
          orderBy: { nextActionDate: "asc" },
          take: 6,
        })
      : Promise.resolve([]),
  ]);
  const done = doneRaw.filter((t) => t.completedAt && todayKey(t.completedAt) === today).slice(0, 12);
  const plan = open
    .filter((t) => t.status !== "BLOCKED")
    .slice(0, 8)
    .map((t) => {
      const due = t.dueDate ? dateToKey(t.dueDate) : null;
      const when = !due ? "" : due < today ? ` (atrasada, prazo ${formatShortDay(due)})` : due === today ? " (vence hoje)" : ` (prazo ${formatShortDay(due)})`;
      return `• ${t.title}${when}`;
    });
  const blocked = open.filter((t) => t.status === "BLOCKED").map((t) => ({ title: t.title, reason: t.blockedReason }));
  const crmDone = [
    ...crmSales.map((s) => `✓ [CRM] Venda: ${s.accountName} (${(s.volumeL ?? 0).toLocaleString("pt-BR")} L)`),
    ...crmContacts.map((c) => `✓ [CRM] ${c.accountName} — ${c.text ?? "contato"}`.slice(0, 200)),
  ];
  const crmPlan = crmActions.map((a) => {
    const due = dateToKey(a.nextActionDate!);
    const when = due < today ? ` (atrasada, ${formatShortDay(due)})` : due === today ? " (hoje)" : " (amanhã)";
    return `• [CRM] ${a.companyName}: ${a.nextAction ?? "próxima ação"}${when}`;
  });
  return { done: [...done.map((t) => `✓ ${t.title}`), ...crmDone], plan: [...plan, ...crmPlan], blocked };
}
