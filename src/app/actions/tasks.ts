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
  revalidatePath("/", "layout");
  return { ok: true, message: `${task.kind === "GOAL" ? "Meta" : "Tarefa"} criada.` };
});

export const updateTask = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  const id = idField.parse(fd.get("id"));
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing || !canEditTask(access.ctx, existing)) throw new AuthorizationError();
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
  const update = { status: next, completedAt: next === "DONE" ? new Date() : null };
  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: update });
    await audit({ actorId: access.user.id, subjectUserId: existing.assigneeId, entityType: "Task", entityId: id, action: "UPDATE", before: { status: existing.status }, after: { status: next } }, tx);
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Status atualizado." };
});

export const deleteTask = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  const id = idField.parse(fd.get("id"));
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing || !canDeleteTask(access.ctx, existing)) throw new AuthorizationError("Você não pode excluir esta tarefa.");
  await prisma.$transaction(async (tx) => {
    await tx.task.updateMany({ where: { parentId: id }, data: { parentId: null } });
    await tx.task.delete({ where: { id } });
    await audit({ actorId: access.user.id, subjectUserId: existing.assigneeId, entityType: "Task", entityId: id, action: "DELETE", before: existing }, tx);
  });
  revalidatePath("/", "layout");
  redirect("/tarefas");
});
