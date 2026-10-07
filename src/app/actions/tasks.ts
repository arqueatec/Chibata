"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { formToObject, safeAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { AuthorizationError, requireActionAccess } from "@/lib/authz";
import { audit, diff } from "@/lib/audit";
import { canAssignTask, canDeleteTask, canEditTask } from "@/lib/domain/access";
import { keyToDate } from "@/lib/domain/dates";
import { idField, optionalDayKey, optionalId, optionalText, requiredText } from "@/lib/validation";
import { setAsanaCompleted } from "@/lib/asana/writeback";
import { AsanaError } from "@/lib/asana/client";
import { recomputeAutoIndicators } from "@/lib/services/autoIndicators";

/** Conclui/reabre no Asana antes de gravar no app; se o Asana recusar, nada muda. */
async function pushCompletion(task: { asanaGid: string | null; status: string }, next: string) {
  if (!task.asanaGid || (task.status === "DONE") === (next === "DONE")) return;
  try {
    await setAsanaCompleted(task.asanaGid, next === "DONE");
  } catch (e) {
    throw new UserFacingError(`Não foi possível atualizar a tarefa no Asana: ${e instanceof AsanaError ? e.message : "erro de conexão"}. Nada foi alterado.`);
  }
}

const status = z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"], { message: "Status inválido." });

const taskSchema = z.object({
  kind: z.enum(["GOAL", "TASK"]).default("TASK"),
  title: requiredText(200, "Título"),
  description: optionalText(4000, "Descrição"),
  assigneeId: idField,
  dueDate: optionalDayKey,
  status: status.default("TODO"),
  blockedReason: optionalText(1000, "Motivo do bloqueio"),
  projectId: optionalId,
  parentId: optionalId,
});

function toData(d: z.infer<typeof taskSchema>) {
  return {
    kind: d.kind,
    title: d.title,
    description: d.description,
    assigneeId: d.assigneeId,
    dueDate: d.dueDate ? keyToDate(d.dueDate) : null,
    status: d.status,
    blockedReason: d.status === "BLOCKED" ? d.blockedReason : null,
    projectId: d.projectId,
    parentId: d.kind === "GOAL" ? null : d.parentId,
  };
}

async function validateRefs(d: ReturnType<typeof toData>) {
  if (d.status === "BLOCKED" && !d.blockedReason) throw new UserFacingError("Informe o motivo do bloqueio.");
  const assignee = await prisma.user.findUnique({ where: { id: d.assigneeId } });
  if (!assignee || !assignee.active) throw new UserFacingError("Responsável inválido.");
  if (d.projectId && !(await prisma.project.findUnique({ where: { id: d.projectId } }))) throw new UserFacingError("Projeto/cliente inválido.");
  if (d.parentId) {
    const parent = await prisma.task.findUnique({ where: { id: d.parentId } });
    if (!parent || parent.kind !== "GOAL") throw new UserFacingError("Meta vinculada inválida.");
  }
}

export const createTask = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  const d = toData(taskSchema.parse(formToObject(fd)));
  if (!canAssignTask(access.ctx, d.assigneeId)) throw new AuthorizationError("Você não pode atribuir tarefas a esta pessoa.");
  await validateRefs(d);
  const task = await prisma.$transaction(async (tx) => {
    const t = await tx.task.create({ data: { ...d, createdById: access.user.id, completedAt: d.status === "DONE" ? new Date() : null } });
    await audit({ actorId: access.user.id, subjectUserId: d.assigneeId, entityType: "Task", entityId: t.id, action: "CREATE", after: d }, tx);
    return t;
  });
  await recomputeAutoIndicators({ userIds: [d.assigneeId] });
  revalidatePath("/", "layout");
  return { ok: true, message: `${task.kind === "GOAL" ? "Meta" : "Tarefa"} criada.` };
});

export const updateTask = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  const id = idField.parse(fd.get("id"));
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing || !canEditTask(access.ctx, existing)) throw new AuthorizationError();
  if (existing.asanaGid) {
    // Tarefas do Asana: título, prazo e responsável vêm de lá; aqui só o status
    const next = z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]).parse(fd.get("status"));
    const blockedReason = next === "BLOCKED" ? optionalText(1000, "Motivo do bloqueio").parse(fd.get("blockedReason") ?? "") : null;
    if (next === "BLOCKED" && !blockedReason) throw new UserFacingError("Informe o motivo do bloqueio.");
    await pushCompletion(existing, next);
    const update = { status: next, blockedReason, completedAt: next === "DONE" ? (existing.completedAt ?? new Date()) : null };
    const ch = diff(existing as unknown as Record<string, unknown>, update);
    if (ch.changed) {
      await prisma.$transaction(async (tx) => {
        await tx.task.update({ where: { id }, data: update });
        await audit({ actorId: access.user.id, subjectUserId: existing.assigneeId, entityType: "Task", entityId: id, action: "UPDATE", before: ch.before, after: ch.after }, tx);
      });
      await recomputeAutoIndicators({ userIds: [existing.assigneeId] });
    }
    revalidatePath("/", "layout");
    return { ok: true, message: "Status atualizado. Título, prazo e responsável são editados no Asana." };
  }
  const d = toData(taskSchema.parse(formToObject(fd)));
  if (d.assigneeId !== existing.assigneeId && !canAssignTask(access.ctx, d.assigneeId)) {
    throw new AuthorizationError("Você não pode atribuir tarefas a esta pessoa.");
  }
  if (d.parentId === id) throw new UserFacingError("Uma tarefa não pode ser vinculada a ela mesma.");
  await validateRefs(d);
  const update = { ...d, completedAt: d.status === "DONE" ? (existing.completedAt ?? new Date()) : null };
  const changes = diff(existing as unknown as Record<string, unknown>, update);
  if (!changes.changed) return { ok: true, message: "Nada a alterar." };
  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: update });
    await audit({ actorId: access.user.id, subjectUserId: d.assigneeId, entityType: "Task", entityId: id, action: "UPDATE", before: changes.before, after: changes.after }, tx);
  });
  await recomputeAutoIndicators({ userIds: [...new Set([d.assigneeId, existing.assigneeId])] });
  revalidatePath("/", "layout");
  return { ok: true, message: "Alterações salvas." };
});

export const setTaskStatus = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  const id = idField.parse(fd.get("id"));
  const next = status.parse(fd.get("status"));
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing || !canEditTask(access.ctx, existing)) throw new AuthorizationError();
  if (next === "BLOCKED" && !existing.blockedReason) throw new UserFacingError("Abra a tarefa para informar o motivo do bloqueio.");
  await pushCompletion(existing, next);
  const update = { status: next, completedAt: next === "DONE" ? new Date() : null };
  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: update });
    await audit({ actorId: access.user.id, subjectUserId: existing.assigneeId, entityType: "Task", entityId: id, action: "UPDATE", before: { status: existing.status }, after: { status: next } }, tx);
  });
  await recomputeAutoIndicators({ userIds: [existing.assigneeId] });
  revalidatePath("/", "layout");
  if (existing.asanaGid && (existing.status === "DONE") !== (next === "DONE")) {
    return { ok: true, message: next === "DONE" ? "Tarefa concluída aqui e no Asana." : "Tarefa reaberta aqui e no Asana." };
  }
  return { ok: true, message: "Status atualizado." };
});

export const deleteTask = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  const id = idField.parse(fd.get("id"));
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing || !canDeleteTask(access.ctx, existing)) throw new AuthorizationError("Você não pode excluir esta tarefa.");
  if (existing.asanaGid) throw new UserFacingError("Esta tarefa vem do Asana: exclua-a lá e ela sai do app na próxima sincronização.");
  await prisma.$transaction(async (tx) => {
    await tx.task.updateMany({ where: { parentId: id }, data: { parentId: null } });
    await tx.task.delete({ where: { id } });
    await audit({ actorId: access.user.id, subjectUserId: existing.assigneeId, entityType: "Task", entityId: id, action: "DELETE", before: existing }, tx);
  });
  revalidatePath("/", "layout");
  redirect("/tarefas");
});
