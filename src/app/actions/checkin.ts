"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { formToObject, safeAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { AuthorizationError, requireActionAccess } from "@/lib/authz";
import { audit, diff } from "@/lib/audit";
import { canDeleteCheckIn, canEditCheckIn, canResolveBlocker } from "@/lib/domain/access";
import { dateToKey, keyToDate, todayKey } from "@/lib/domain/dates";
import { checkbox, dayKey, idField, optionalText, requiredText } from "@/lib/validation";
import { indicatorsForUser } from "@/lib/services/indicators";

const schema = z.object({
  userId: idField,
  date: dayKey,
  yesterday: requiredText(2000, "O que foi feito"),
  today: requiredText(2000, "O que será feito"),
  blockers: optionalText(2000, "Bloqueios"),
  needsHelp: checkbox,
  selfScore: z.coerce
    .number({ message: "Escolha uma autoavaliação de 1 a 5." })
    .int()
    .min(1, { message: "Escolha uma autoavaliação de 1 a 5." })
    .max(5, { message: "Escolha uma autoavaliação de 1 a 5." }),
});

const indicatorValue = z
  .string()
  .transform((v) => v.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."))
  .refine((v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1e12), {
    message: "Valores de indicadores devem ser números maiores ou iguais a zero.",
  })
  .transform((v) => (v === "" ? null : Number(v)));

export const saveCheckIn = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  const raw = formToObject(fd);
  const data = schema.parse(raw);
  const today = todayKey();

  const decision = canEditCheckIn(access.ctx, data.userId, data.date, today);
  if (!decision.allowed) throw new AuthorizationError(decision.reason);

  const indicators = await indicatorsForUser(data.userId);
  const values = new Map<string, number | null>();
  for (const ind of indicators) {
    const key = `ind_${ind.id}`;
    if (key in raw) values.set(ind.id, indicatorValue.parse(String(raw[key] ?? "")));
  }

  const date = keyToDate(data.date);
  const actorId = access.user.id;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.checkIn.findUnique({ where: { userId_date: { userId: data.userId, date } } });
    const fields = {
      yesterday: data.yesterday,
      today: data.today,
      blockers: data.blockers,
      needsHelp: data.blockers ? data.needsHelp : false,
      selfScore: data.selfScore,
    };
    if (existing) {
      const reopenBlocker = !!data.blockers && data.blockers !== existing.blockers;
      const update = { ...fields, ...(reopenBlocker ? { blockerResolvedAt: null, blockerResolvedById: null } : {}) };
      const d = diff(existing as unknown as Record<string, unknown>, update);
      if (d.changed) {
        await tx.checkIn.update({ where: { id: existing.id }, data: update });
        await audit({ actorId, subjectUserId: data.userId, entityType: "CheckIn", entityId: existing.id, action: "UPDATE", before: { date: data.date, ...d.before }, after: { date: data.date, ...d.after } }, tx);
      }
    } else {
      const created = await tx.checkIn.create({ data: { userId: data.userId, date, ...fields } });
      await audit({ actorId, subjectUserId: data.userId, entityType: "CheckIn", entityId: created.id, action: "CREATE", after: { date: data.date, ...fields } }, tx);
    }

    const current = await tx.indicatorEntry.findMany({ where: { userId: data.userId, date, indicatorId: { in: [...values.keys()] } } });
    for (const [indicatorId, value] of values) {
      const prev = current.find((c) => c.indicatorId === indicatorId);
      const name = indicators.find((i) => i.id === indicatorId)!.name;
      if (value === null) {
        if (prev) {
          await tx.indicatorEntry.delete({ where: { id: prev.id } });
          await audit({ actorId, subjectUserId: data.userId, entityType: "IndicatorEntry", entityId: prev.id, action: "DELETE", before: { indicator: name, date: data.date, value: prev.value } }, tx);
        }
      } else if (!prev) {
        const e = await tx.indicatorEntry.create({ data: { indicatorId, userId: data.userId, date, value } });
        await audit({ actorId, subjectUserId: data.userId, entityType: "IndicatorEntry", entityId: e.id, action: "CREATE", after: { indicator: name, date: data.date, value } }, tx);
      } else if (prev.value !== value) {
        await tx.indicatorEntry.update({ where: { id: prev.id }, data: { value } });
        await audit({ actorId, subjectUserId: data.userId, entityType: "IndicatorEntry", entityId: prev.id, action: "UPDATE", before: { indicator: name, date: data.date, value: prev.value }, after: { indicator: name, date: data.date, value } }, tx);
      }
    }
  });

  revalidatePath("/", "layout");
  return { ok: true, message: "Check-in salvo. Bom trabalho!" };
});

export const deleteCheckIn = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  if (!canDeleteCheckIn(access.ctx)) throw new AuthorizationError("Somente o administrador pode excluir check-ins.");
  const id = idField.parse(fd.get("id"));
  await prisma.$transaction(async (tx) => {
    const ci = await tx.checkIn.findUnique({ where: { id } });
    if (!ci) throw new UserFacingError("Check-in não encontrado.");
    const entries = await tx.indicatorEntry.findMany({ where: { userId: ci.userId, date: ci.date }, include: { indicator: { select: { name: true } } } });
    await tx.indicatorEntry.deleteMany({ where: { userId: ci.userId, date: ci.date } });
    await tx.checkIn.delete({ where: { id } });
    await audit(
      {
        actorId: access.user.id,
        subjectUserId: ci.userId,
        entityType: "CheckIn",
        entityId: id,
        action: "DELETE",
        before: { ...ci, date: dateToKey(ci.date), indicadores: entries.map((e) => ({ indicator: e.indicator.name, value: e.value })) },
      },
      tx,
    );
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Check-in excluído." };
});

export const resolveBlocker = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  const id = idField.parse(fd.get("id"));
  const ci = await prisma.checkIn.findUnique({ where: { id } });
  if (!ci) throw new UserFacingError("Check-in não encontrado.");
  if (!canResolveBlocker(access.ctx, ci.userId)) throw new AuthorizationError();
  if (ci.blockerResolvedAt) return { ok: true, message: "Bloqueio já estava resolvido." };
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.checkIn.update({ where: { id }, data: { blockerResolvedAt: now, blockerResolvedById: access.user.id } });
    await audit({ actorId: access.user.id, subjectUserId: ci.userId, entityType: "CheckIn", entityId: id, action: "RESOLVE", before: { blockerResolvedAt: null }, after: { blockerResolvedAt: now } }, tx);
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Bloqueio marcado como resolvido." };
});
