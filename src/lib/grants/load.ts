import "server-only";
import { prisma } from "@/lib/db";
import { dateToKey } from "@/lib/domain/dates";
import type { GrantItemKind, GrantStatus } from "@/lib/domain/grants";

const key = (d: Date | null) => (d ? dateToKey(d) : null);

/** Editais com itens e histórico, já com as datas em AAAA-MM-DD (formato das funções de domínio). */
export async function loadGrants(where: { id?: string } = {}) {
  const rows = await prisma.grant.findMany({
    where,
    include: {
      owner: { select: { name: true } },
      items: { include: { assignee: { select: { id: true, name: true } }, task: { select: { id: true, status: true } } }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] },
      statusChanges: { orderBy: [{ day: "asc" }, { at: "asc" }] },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
  return rows.map((g) => ({
    ...g,
    status: g.status as GrantStatus,
    ownerName: g.owner.name,
    submissionDeadline: key(g.submissionDeadline),
    resultExpected: key(g.resultExpected),
    executionStart: key(g.executionStart),
    executionEnd: key(g.executionEnd),
    raw: g,
    items: g.items.map((i) => ({
      ...i,
      kind: i.kind as GrantItemKind,
      dueDate: key(i.dueDate),
      // Concluído aqui ou pela tarefa vinculada (marcada em Tarefas)
      done: !!i.doneAt || i.task?.status === "DONE",
    })),
    changes: g.statusChanges.map((c) => ({ ...c, toStatus: c.toStatus as GrantStatus, day: dateToKey(c.day) })),
  }));
}

export type LoadedGrant = Awaited<ReturnType<typeof loadGrants>>[number];
