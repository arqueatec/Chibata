"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formToObject, safeAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { AuthorizationError, requireActionAccess } from "@/lib/authz";
import { audit, diff } from "@/lib/audit";
import { canReopenReview, canWriteReview } from "@/lib/domain/access";
import { endOfMonth, keyToDate, minKey, periodContaining, startOfMonth, todayKey } from "@/lib/domain/dates";
import { dayKey, idField, optionalText } from "@/lib/validation";
import { loadPerformanceData, scoreUser } from "@/lib/services/performance";

const textSchema = z.object({
  userId: idField,
  month: dayKey,
  summary: optionalText(4000, "Resumo"),
  strengths: optionalText(4000, "Pontos fortes"),
  improvements: optionalText(4000, "Pontos a desenvolver"),
});

export const saveReview = safeAction(async (prev: ActionResult, fd: FormData) => {
  if (fd.get("intent") === "finalize") return finalizeReview(prev, fd);
  const access = await requireActionAccess();
  const d = textSchema.parse(formToObject(fd));
  if (!canWriteReview(access.ctx, d.userId)) throw new AuthorizationError("Você não pode redigir a revisão desta pessoa.");
  const month = keyToDate(startOfMonth(d.month));
  const fields = { summary: d.summary ?? "", strengths: d.strengths ?? "", improvements: d.improvements ?? "" };
  await prisma.$transaction(async (tx) => {
    const existing = await tx.monthlyReview.findUnique({ where: { userId_month: { userId: d.userId, month } } });
    if (existing?.status === "FINALIZED") throw new UserFacingError("Revisão finalizada. Somente o administrador pode reabri-la.");
    if (existing) {
      const ch = diff(existing as unknown as Record<string, unknown>, fields);
      if (!ch.changed) return;
      await tx.monthlyReview.update({ where: { id: existing.id }, data: fields });
      await audit({ actorId: access.user.id, subjectUserId: d.userId, entityType: "MonthlyReview", entityId: existing.id, action: "UPDATE", before: ch.before, after: ch.after }, tx);
    } else {
      const r = await tx.monthlyReview.create({ data: { userId: d.userId, month, ...fields } });
      await audit({ actorId: access.user.id, subjectUserId: d.userId, entityType: "MonthlyReview", entityId: r.id, action: "CREATE", after: fields }, tx);
    }
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Rascunho salvo." };
});

export const finalizeReview = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  const d = textSchema.parse(formToObject(fd));
  if (!canWriteReview(access.ctx, d.userId)) throw new AuthorizationError("Você não pode finalizar a revisão desta pessoa.");
  const monthKey = startOfMonth(d.month);
  if (monthKey > todayKey()) throw new UserFacingError("Não é possível finalizar a revisão de um mês futuro.");
  const period = periodContaining("month", monthKey);
  const perf = await loadPerformanceData([d.userId], period.start, period.end);
  const score = scoreUser(perf, d.userId, period, minKey(endOfMonth(monthKey), todayKey()));
  const month = keyToDate(monthKey);
  const fields = { summary: d.summary ?? "", strengths: d.strengths ?? "", improvements: d.improvements ?? "" };
  await prisma.$transaction(async (tx) => {
    const existing = await tx.monthlyReview.findUnique({ where: { userId_month: { userId: d.userId, month } } });
    if (existing?.status === "FINALIZED") throw new UserFacingError("Revisão já finalizada.");
    const data = {
      ...fields,
      status: "FINALIZED" as const,
      finalScore: score?.score ?? null,
      breakdown: (score ?? undefined) as unknown as Prisma.InputJsonValue,
      finalizedAt: new Date(),
      finalizedById: access.user.id,
    };
    const r = existing
      ? await tx.monthlyReview.update({ where: { id: existing.id }, data })
      : await tx.monthlyReview.create({ data: { userId: d.userId, month, ...data } });
    await audit(
      {
        actorId: access.user.id,
        subjectUserId: d.userId,
        entityType: "MonthlyReview",
        entityId: r.id,
        action: "FINALIZE",
        before: existing ? { status: existing.status, ...diff(existing as unknown as Record<string, unknown>, fields).before } : null,
        after: { status: "FINALIZED", finalScore: data.finalScore, ...fields },
      },
      tx,
    );
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Revisão finalizada. A nota do mês foi congelada." };
});

export const reopenReview = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  if (!canReopenReview(access.ctx)) throw new AuthorizationError("Somente o administrador pode reabrir revisões finalizadas.");
  const id = idField.parse(fd.get("id"));
  const reason = z
    .string()
    .trim()
    .min(10, { message: "Descreva a justificativa (mínimo de 10 caracteres)." })
    .max(1000)
    .parse(fd.get("reason") ?? "");
  await prisma.$transaction(async (tx) => {
    const r = await tx.monthlyReview.findUnique({ where: { id } });
    if (!r) throw new UserFacingError("Revisão não encontrada.");
    if (r.status !== "FINALIZED") throw new UserFacingError("A revisão não está finalizada.");
    await tx.monthlyReview.update({ where: { id }, data: { status: "DRAFT", finalizedAt: null, finalizedById: null } });
    await audit(
      {
        actorId: access.user.id,
        subjectUserId: r.userId,
        entityType: "MonthlyReview",
        entityId: id,
        action: "REOPEN",
        before: { status: r.status, finalScore: r.finalScore, finalizedAt: r.finalizedAt, finalizedById: r.finalizedById },
        after: { status: "DRAFT" },
        reason,
      },
      tx,
    );
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Revisão reaberta. A justificativa foi registrada na auditoria." };
});
