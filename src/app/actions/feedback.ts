"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { formToObject, safeAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { AuthorizationError, requireActionAccess } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { canGiveFeedback, isAdmin } from "@/lib/domain/access";
import { keyToDate, periodContaining } from "@/lib/domain/dates";
import { idField, optionalDayKey, optionalId, requiredText } from "@/lib/validation";

const schema = z.object({
  targetUserId: idField,
  kind: z.enum(["COMMENT", "RECOGNITION"]).default("COMMENT"),
  body: requiredText(2000, "Feedback"),
  checkInId: optionalId,
  taskId: optionalId,
  periodType: z
    .enum(["WEEK", "MONTH", ""])
    .optional()
    .transform((v) => (v ? v : null)),
  periodStart: optionalDayKey,
});

export const createFeedback = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  const d = schema.parse(formToObject(fd));
  if (!canGiveFeedback(access.ctx, d.targetUserId)) throw new AuthorizationError("Você não pode registrar feedback para esta pessoa.");
  if (d.checkInId) {
    const ci = await prisma.checkIn.findUnique({ where: { id: d.checkInId } });
    if (!ci || ci.userId !== d.targetUserId) throw new UserFacingError("Check-in inválido.");
  }
  if (d.taskId) {
    const t = await prisma.task.findUnique({ where: { id: d.taskId } });
    if (!t || t.assigneeId !== d.targetUserId) throw new UserFacingError("Tarefa inválida.");
  }
  let periodStart: Date | null = null;
  if (d.periodType) {
    if (!d.periodStart) throw new UserFacingError("Informe o período.");
    periodStart = keyToDate(periodContaining(d.periodType === "WEEK" ? "week" : "month", d.periodStart).start);
  }
  await prisma.$transaction(async (tx) => {
    const f = await tx.feedback.create({
      data: {
        kind: d.kind,
        body: d.body,
        authorId: access.user.id,
        targetUserId: d.targetUserId,
        checkInId: d.checkInId,
        taskId: d.taskId,
        periodType: d.periodType,
        periodStart,
      },
    });
    await audit({ actorId: access.user.id, subjectUserId: d.targetUserId, entityType: "Feedback", entityId: f.id, action: "CREATE", after: { kind: d.kind, body: d.body } }, tx);
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Feedback registrado. A pessoa poderá vê-lo no perfil dela." };
});

export const deleteFeedback = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  const id = idField.parse(fd.get("id"));
  const f = await prisma.feedback.findUnique({ where: { id } });
  if (!f) throw new UserFacingError("Feedback não encontrado.");
  if (!isAdmin(access.ctx) && f.authorId !== access.user.id) throw new AuthorizationError();
  await prisma.$transaction(async (tx) => {
    await tx.feedback.delete({ where: { id } });
    await audit({ actorId: access.user.id, subjectUserId: f.targetUserId, entityType: "Feedback", entityId: id, action: "DELETE", before: f }, tx);
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Feedback excluído." };
});
