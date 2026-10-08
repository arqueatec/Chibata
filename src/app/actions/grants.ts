"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { formToObject, safeAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { AuthorizationError, requireActionAccess } from "@/lib/authz";
import { audit, diff } from "@/lib/audit";
import { keyToDate, todayKey } from "@/lib/domain/dates";
import { GRANT_ITEM_KINDS, GRANT_STATUSES } from "@/lib/domain/grants";
import { assertCanSeeGrants } from "@/lib/grants/access";
import { recomputeAutoIndicators } from "@/lib/services/autoIndicators";
import { checkbox, idField, optionalDayKey, optionalText, requiredText } from "@/lib/validation";

/** Valor em reais opcional ("R$ 150.000,00", "150000"). */
const money = (label: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ?? "").replace(/[^\d,.-]/g, ""))
    .transform((v) => (v === "" ? null : Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v)))
    .refine((n) => n === null || (Number.isFinite(n) && n >= 0), { message: `${label}: valor inválido.` });

const url = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim())
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), { message: "Link: use um endereço começando com http:// ou https://." })
  .transform((v) => (v === "" ? null : v));

const grantSchema = z.object({
  title: requiredText(200, "Título"),
  funder: requiredText(120, "Órgão de fomento"),
  callName: optionalText(200, "Chamada"),
  url,
  ownerId: idField,
  requestedAmount: money("Valor solicitado"),
  approvedAmount: money("Valor aprovado"),
  counterpartAmount: money("Contrapartida"),
  submissionDeadline: optionalDayKey,
  resultExpected: optionalDayKey,
  executionStart: optionalDayKey,
  executionEnd: optionalDayKey,
  notes: optionalText(4000, "Observações"),
});

const day = (v: string | undefined) => (v ? keyToDate(v) : null);

function toData(d: z.infer<typeof grantSchema>) {
  return {
    title: d.title,
    funder: d.funder,
    callName: d.callName,
    url: d.url,
    ownerId: d.ownerId,
    requestedAmount: d.requestedAmount,
    approvedAmount: d.approvedAmount,
    counterpartAmount: d.counterpartAmount,
    submissionDeadline: day(d.submissionDeadline),
    resultExpected: day(d.resultExpected),
    executionStart: day(d.executionStart),
    executionEnd: day(d.executionEnd),
    notes: d.notes,
  };
}

async function assertOwner(id: string) {
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u || !u.active) throw new UserFacingError("Responsável inválido.");
}

function done(path?: string) {
  revalidatePath("/editais", "layout");
  revalidatePath("/");
  if (path) revalidatePath(path);
}

export const createGrant = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  assertCanSeeGrants(access);
  const raw = formToObject(fd);
  const d = toData(grantSchema.parse(raw));
  const status = z.enum(GRANT_STATUSES).catch("PROSPECT").parse(raw.status);
  await assertOwner(d.ownerId);
  const g = await prisma.$transaction(async (tx) => {
    const g = await tx.grant.create({ data: { ...d, status, createdById: access.user.id } });
    await tx.grantStatusChange.create({ data: { grantId: g.id, fromStatus: null, toStatus: status, day: keyToDate(todayKey()), actorId: access.user.id } });
    await audit({ actorId: access.user.id, entityType: "Grant", entityId: g.id, action: "CREATE", after: { ...d, status } }, tx);
    return g;
  });
  done();
  redirect(`/editais/${g.id}`);
});

export const updateGrant = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  assertCanSeeGrants(access);
  const id = idField.parse(fd.get("id"));
  const existing = await prisma.grant.findUnique({ where: { id } });
  if (!existing) throw new UserFacingError("Edital não encontrado.");
  const d = toData(grantSchema.parse(formToObject(fd)));
  await assertOwner(d.ownerId);
  const ch = diff(existing as unknown as Record<string, unknown>, d);
  if (!ch.changed) return { ok: true, message: "Nada a alterar." };
  await prisma.$transaction(async (tx) => {
    await tx.grant.update({ where: { id }, data: d });
    await audit({ actorId: access.user.id, entityType: "Grant", entityId: id, action: "UPDATE", before: { title: existing.title, ...ch.before }, after: ch.after }, tx);
  });
  // O valor aprovado e o responsável entram nos indicadores automáticos
  if ("approvedAmount" in ch.after || "ownerId" in ch.after) await recomputeAutoIndicators();
  done(`/editais/${id}`);
  return { ok: true, message: "Edital salvo." };
});

const statusSchema = z.object({
  id: idField,
  status: z.enum(GRANT_STATUSES, { message: "Etapa inválida." }),
  day: optionalDayKey,
  approvedAmount: money("Valor aprovado"),
});

export const changeGrantStatus = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  assertCanSeeGrants(access);
  const d = statusSchema.parse(formToObject(fd));
  const existing = await prisma.grant.findUnique({ where: { id: d.id } });
  if (!existing) throw new UserFacingError("Edital não encontrado.");
  const today = todayKey();
  const when = d.day ?? today;
  if (when > today) throw new UserFacingError("A data da mudança não pode ser no futuro.");
  if (existing.status === d.status && d.approvedAmount === null) return { ok: true, message: "O edital já está nesta etapa." };
  const approvedAmount = d.approvedAmount ?? existing.approvedAmount;
  await prisma.$transaction(async (tx) => {
    await tx.grant.update({ where: { id: d.id }, data: { status: d.status, approvedAmount } });
    if (existing.status !== d.status) {
      await tx.grantStatusChange.create({ data: { grantId: d.id, fromStatus: existing.status, toStatus: d.status, day: keyToDate(when), actorId: access.user.id } });
    }
    await audit(
      { actorId: access.user.id, entityType: "Grant", entityId: d.id, action: "UPDATE", before: { title: existing.title, status: existing.status, approvedAmount: existing.approvedAmount }, after: { status: d.status, approvedAmount, dia: when } },
      tx,
    );
  });
  await recomputeAutoIndicators();
  done(`/editais/${d.id}`);
  return { ok: true, message: "Etapa atualizada." };
});

export const deleteGrant = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  if (!access.isAdmin) throw new AuthorizationError("Só o administrador pode excluir um edital.");
  const id = idField.parse(fd.get("id"));
  const existing = await prisma.grant.findUnique({ where: { id }, include: { items: { select: { taskId: true } } } });
  if (!existing) throw new UserFacingError("Edital não encontrado.");
  const taskIds = existing.items.map((i) => i.taskId).filter((t): t is string => !!t);
  await prisma.$transaction(async (tx) => {
    await tx.grant.delete({ where: { id } });
    // Tarefas abertas criadas para os itens deixam de fazer sentido; as concluídas ficam no histórico da pessoa
    if (taskIds.length) await tx.task.deleteMany({ where: { id: { in: taskIds }, status: { not: "DONE" } } });
    await audit({ actorId: access.user.id, entityType: "Grant", entityId: id, action: "DELETE", before: { title: existing.title, funder: existing.funder, status: existing.status } }, tx);
  });
  await recomputeAutoIndicators();
  done();
  redirect("/editais");
});

const itemSchema = z.object({
  grantId: idField,
  kind: z.enum(GRANT_ITEM_KINDS, { message: "Tipo inválido." }),
  title: requiredText(200, "Descrição"),
  dueDate: optionalDayKey,
  assigneeId: z.string().optional().transform((v) => (v ? v : null)),
  amount: money("Valor"),
  createTask: checkbox,
});

export const addGrantItem = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  assertCanSeeGrants(access);
  const d = itemSchema.parse(formToObject(fd));
  const grant = await prisma.grant.findUnique({ where: { id: d.grantId } });
  if (!grant) throw new UserFacingError("Edital não encontrado.");
  if (d.assigneeId) await assertOwner(d.assigneeId);
  if (d.createTask && !d.assigneeId) throw new UserFacingError("Para criar a tarefa, escolha o responsável.");
  await prisma.$transaction(async (tx) => {
    const task = d.createTask
      ? await tx.task.create({
          data: {
            kind: "TASK",
            title: `[Edital ${grant.funder}] ${d.title}`.slice(0, 200),
            description: `Item do edital “${grant.title}”.`,
            assigneeId: d.assigneeId!,
            createdById: access.user.id,
            dueDate: d.dueDate ? keyToDate(d.dueDate) : null,
          },
        })
      : null;
    const item = await tx.grantItem.create({
      data: { grantId: d.grantId, kind: d.kind, title: d.title, dueDate: d.dueDate ? keyToDate(d.dueDate) : null, assigneeId: d.assigneeId, amount: d.amount, taskId: task?.id ?? null },
    });
    await audit({ actorId: access.user.id, subjectUserId: d.assigneeId, entityType: "GrantItem", entityId: item.id, action: "CREATE", after: { edital: grant.title, ...d } }, tx);
  });
  if (d.createTask) await recomputeAutoIndicators({ userIds: [d.assigneeId!] });
  done(`/editais/${d.grantId}`);
  return { ok: true, message: d.createTask ? "Item adicionado e tarefa criada para o responsável." : "Item adicionado." };
});

export const toggleGrantItem = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  assertCanSeeGrants(access);
  const id = idField.parse(fd.get("id"));
  const item = await prisma.grantItem.findUnique({ where: { id }, include: { task: true } });
  if (!item) throw new UserFacingError("Item não encontrado.");
  const wasDone = !!item.doneAt || item.task?.status === "DONE";
  const doneAt = wasDone ? null : new Date();
  if (item.task?.asanaGid) throw new UserFacingError("A tarefa deste item vem do Asana: conclua por lá ou em Tarefas.");
  await prisma.$transaction(async (tx) => {
    await tx.grantItem.update({ where: { id }, data: { doneAt } });
    if (item.task) {
      await tx.task.update({ where: { id: item.task.id }, data: { status: doneAt ? "DONE" : "TODO", completedAt: doneAt, blockedReason: null } });
    }
    await audit({ actorId: access.user.id, subjectUserId: item.assigneeId, entityType: "GrantItem", entityId: id, action: "UPDATE", before: { title: item.title, concluido: wasDone }, after: { concluido: !wasDone } }, tx);
  });
  if (item.task) await recomputeAutoIndicators({ userIds: [item.task.assigneeId] });
  done(`/editais/${item.grantId}`);
  return { ok: true, message: doneAt ? "Item concluído." : "Item reaberto." };
});

export const deleteGrantItem = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  assertCanSeeGrants(access);
  const id = idField.parse(fd.get("id"));
  const item = await prisma.grantItem.findUnique({ where: { id }, include: { task: true } });
  if (!item) throw new UserFacingError("Item não encontrado.");
  await prisma.$transaction(async (tx) => {
    await tx.grantItem.delete({ where: { id } });
    if (item.task && item.task.status !== "DONE" && !item.task.asanaGid) await tx.task.delete({ where: { id: item.task.id } });
    await audit({ actorId: access.user.id, subjectUserId: item.assigneeId, entityType: "GrantItem", entityId: id, action: "DELETE", before: { title: item.title, kind: item.kind } }, tx);
  });
  if (item.task) await recomputeAutoIndicators({ userIds: [item.task.assigneeId] });
  done(`/editais/${item.grantId}`);
  return { ok: true, message: "Item excluído." };
});

export const saveGrantsTeam = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  if (!access.isAdmin) throw new AuthorizationError();
  const ids = new Set(fd.getAll("member").map(String));
  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, grantsTeam: true } });
  const changed = users.filter((u) => u.grantsTeam !== ids.has(u.id));
  if (!changed.length) return { ok: true, message: "Nada a alterar." };
  await prisma.$transaction(async (tx) => {
    for (const u of changed) {
      await tx.user.update({ where: { id: u.id }, data: { grantsTeam: ids.has(u.id) } });
      await audit({ actorId: access.user.id, subjectUserId: u.id, entityType: "User", entityId: u.id, action: "UPDATE", before: { equipeEditais: u.grantsTeam }, after: { equipeEditais: ids.has(u.id) } }, tx);
    }
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Equipe de editais atualizada." };
});
