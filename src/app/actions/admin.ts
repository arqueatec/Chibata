"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { formToObject, safeAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { AuthorizationError, requireActionAccess, type Access } from "@/lib/authz";
import { audit, diff } from "@/lib/audit";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { canManageOrganization, canManagePersonalIndicator, subordinateIds } from "@/lib/domain/access";
import { checkbox, numberField, optionalId, optionalText, requiredText } from "@/lib/validation";

async function requireAdmin(): Promise<Access> {
  const a = await requireActionAccess();
  if (!canManageOrganization(a.ctx)) throw new AuthorizationError("Somente o administrador pode fazer isso.");
  return a;
}

// ---------- Pessoas ----------
const userSchema = z.object({
  id: optionalId,
  name: requiredText(120, "Nome"),
  email: z.string().trim().toLowerCase().pipe(z.email({ message: "E-mail inválido." })),
  role: z.enum(["ADMIN", "COORDINATOR", "COLLABORATOR"], { message: "Perfil inválido." }),
  jobTitle: optionalText(120, "Cargo"),
  areaId: optionalId,
  managerId: optionalId,
  active: checkbox,
  password: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || v.length >= MIN_PASSWORD_LENGTH, { message: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` }),
});

export const saveUser = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireAdmin();
  const d = userSchema.parse(formToObject(fd));
  if (d.id && d.managerId === d.id) throw new UserFacingError("Uma pessoa não pode liderar a si mesma.");
  if (d.id && d.managerId) {
    const links = await prisma.user.findMany({ select: { id: true, managerId: true } });
    if (subordinateIds(d.id, links).has(d.managerId)) throw new UserFacingError("Relação de liderança circular: o líder escolhido é liderado por esta pessoa.");
  }
  if (d.id === access.user.id && (!d.active || d.role !== "ADMIN")) {
    throw new UserFacingError("Você não pode remover o próprio acesso de administrador.");
  }
  const fields = { name: d.name, email: d.email, role: d.role, jobTitle: d.jobTitle, areaId: d.areaId, managerId: d.managerId, active: d.active };
  await prisma.$transaction(async (tx) => {
    if (d.id) {
      const existing = await tx.user.findUniqueOrThrow({ where: { id: d.id } });
      const ch = diff(existing as unknown as Record<string, unknown>, fields);
      await tx.user.update({ where: { id: d.id }, data: { ...fields, ...(d.password ? { passwordHash: await hashPassword(d.password) } : {}) } });
      if (!d.active) await tx.session.deleteMany({ where: { userId: d.id } });
      if (ch.changed || d.password) {
        await audit({ actorId: access.user.id, subjectUserId: d.id, entityType: "User", entityId: d.id, action: "UPDATE", before: ch.before, after: { ...ch.after, ...(d.password ? { senha: "redefinida" } : {}) } }, tx);
      }
    } else {
      const u = await tx.user.create({ data: { ...fields, passwordHash: d.password ? await hashPassword(d.password) : null } });
      await audit({ actorId: access.user.id, subjectUserId: u.id, entityType: "User", entityId: u.id, action: "CREATE", after: fields }, tx);
    }
  });
  revalidatePath("/", "layout");
  return { ok: true, message: d.id ? "Pessoa atualizada." : "Pessoa criada. Ela pode entrar por link mágico ou com a senha definida." };
});

// ---------- Áreas ----------
const areaSchema = z.object({
  id: optionalId,
  name: requiredText(120, "Nome"),
  description: optionalText(500, "Descrição"),
  indicatorsWeight: numberField("Peso dos indicadores", { min: 0, max: 100 }),
  checkinWeight: numberField("Peso do check-in", { min: 0, max: 100 }),
  allowPersonalIndicators: checkbox,
  active: checkbox,
});

export const saveArea = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireAdmin();
  const d = areaSchema.parse(formToObject(fd));
  if (d.indicatorsWeight + d.checkinWeight <= 0) throw new UserFacingError("A soma dos pesos deve ser maior que zero.");
  const fields = {
    name: d.name,
    description: d.description,
    indicatorsWeight: Math.round(d.indicatorsWeight),
    checkinWeight: Math.round(d.checkinWeight),
    allowPersonalIndicators: d.allowPersonalIndicators,
    active: d.active,
  };
  await prisma.$transaction(async (tx) => {
    if (d.id) {
      const existing = await tx.area.findUniqueOrThrow({ where: { id: d.id } });
      const ch = diff(existing as unknown as Record<string, unknown>, fields);
      if (!ch.changed) return;
      await tx.area.update({ where: { id: d.id }, data: fields });
      await audit({ actorId: access.user.id, entityType: "Area", entityId: d.id, action: "UPDATE", before: ch.before, after: ch.after }, tx);
    } else {
      const a = await tx.area.create({ data: fields });
      await audit({ actorId: access.user.id, entityType: "Area", entityId: a.id, action: "CREATE", after: fields }, tx);
    }
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Área salva." };
});

// ---------- Indicadores ----------
const indicatorSchema = z.object({
  id: optionalId,
  name: requiredText(120, "Nome"),
  description: optionalText(500, "Descrição"),
  unit: z.enum(["COUNT", "CURRENCY", "PERCENT", "HOURS"]),
  direction: z.enum(["HIGHER_BETTER", "LOWER_BETTER"]),
  aggregation: z.enum(["SUM", "LAST"]),
  targetValue: numberField("Meta", { min: 0, max: 1e12 }),
  targetPeriod: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  weight: numberField("Peso", { min: 0, max: 100 }),
  sortOrder: numberField("Ordem", { min: 0, max: 1000 }).optional().default(0),
  active: checkbox,
  areaId: optionalId,
  ownerId: optionalId,
});

async function authorizeIndicator(access: Access, target: { areaId: string | null; ownerId: string | null }) {
  if (canManageOrganization(access.ctx)) return;
  if (!target.ownerId || target.areaId) throw new AuthorizationError("Somente o administrador gerencia indicadores de área.");
  const owner = await prisma.user.findUnique({ where: { id: target.ownerId }, include: { area: true } });
  if (!owner || !canManagePersonalIndicator(access.ctx, owner.id, !!owner.area?.allowPersonalIndicators)) {
    throw new AuthorizationError("Você não pode gerenciar indicadores pessoais.");
  }
}

export const saveIndicator = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  const d = indicatorSchema.parse(formToObject(fd));
  if (!!d.areaId === !!d.ownerId) throw new UserFacingError("Escolha uma área OU uma pessoa (indicador pessoal).");
  const fields = {
    name: d.name,
    description: d.description,
    unit: d.unit,
    direction: d.direction,
    aggregation: d.aggregation,
    targetValue: d.targetValue,
    targetPeriod: d.targetPeriod,
    weight: d.weight,
    sortOrder: Math.round(d.sortOrder),
    active: d.active,
    areaId: d.areaId,
    ownerId: d.ownerId,
  };
  await authorizeIndicator(access, fields);
  await prisma.$transaction(async (tx) => {
    if (d.id) {
      const existing = await tx.indicator.findUniqueOrThrow({ where: { id: d.id } });
      await authorizeIndicator(access, existing);
      const ch = diff(existing as unknown as Record<string, unknown>, fields);
      if (!ch.changed) return;
      await tx.indicator.update({ where: { id: d.id }, data: fields });
      await audit({ actorId: access.user.id, subjectUserId: existing.ownerId, entityType: "Indicator", entityId: d.id, action: "UPDATE", before: { name: existing.name, ...ch.before }, after: ch.after }, tx);
    } else {
      const i = await tx.indicator.create({ data: fields });
      await audit({ actorId: access.user.id, subjectUserId: d.ownerId, entityType: "Indicator", entityId: i.id, action: "CREATE", after: fields }, tx);
    }
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Indicador salvo." };
});

export const deleteIndicator = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireActionAccess();
  const id = z.string().min(1).parse(fd.get("id"));
  const existing = await prisma.indicator.findUnique({ where: { id }, include: { _count: { select: { entries: true } } } });
  if (!existing) throw new UserFacingError("Indicador não encontrado.");
  await authorizeIndicator(access, existing);
  await prisma.$transaction(async (tx) => {
    if (existing._count.entries > 0) {
      // preserva o histórico: apenas desativa
      await tx.indicator.update({ where: { id }, data: { active: false } });
      await audit({ actorId: access.user.id, subjectUserId: existing.ownerId, entityType: "Indicator", entityId: id, action: "UPDATE", before: { name: existing.name, active: existing.active }, after: { active: false }, reason: "Desativado (possui lançamentos)" }, tx);
    } else {
      await tx.indicator.delete({ where: { id } });
      await audit({ actorId: access.user.id, subjectUserId: existing.ownerId, entityType: "Indicator", entityId: id, action: "DELETE", before: existing }, tx);
    }
  });
  revalidatePath("/", "layout");
  return { ok: true, message: existing._count.entries > 0 ? "Indicador desativado (histórico preservado)." : "Indicador excluído." };
});

// ---------- Projetos / clientes ----------
const projectSchema = z.object({
  id: optionalId,
  name: requiredText(160, "Nome"),
  kind: z.enum(["PROJECT", "CLIENT"]),
  active: checkbox,
});

export const saveProject = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireAdmin();
  const d = projectSchema.parse(formToObject(fd));
  const fields = { name: d.name, kind: d.kind, active: d.active };
  await prisma.$transaction(async (tx) => {
    if (d.id) {
      const existing = await tx.project.findUniqueOrThrow({ where: { id: d.id } });
      const ch = diff(existing as unknown as Record<string, unknown>, fields);
      if (!ch.changed) return;
      await tx.project.update({ where: { id: d.id }, data: fields });
      await audit({ actorId: access.user.id, entityType: "Project", entityId: d.id, action: "UPDATE", before: ch.before, after: ch.after }, tx);
    } else {
      const p = await tx.project.create({ data: fields });
      await audit({ actorId: access.user.id, entityType: "Project", entityId: p.id, action: "CREATE", after: fields }, tx);
    }
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Projeto/cliente salvo." };
});
