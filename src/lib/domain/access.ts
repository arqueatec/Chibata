/**
 * Regras de autorização (puras). Toda verificação é feita no servidor usando estas funções.
 * A hierarquia de liderança vem do banco (User.managerId), portanto novas pessoas,
 * áreas e relações de liderança não exigem mudança de código.
 */
import { checkInEditDecision, type EditDecision } from "./editWindow";
import type { DayKey } from "./dates";

export type RoleName = "ADMIN" | "COORDINATOR" | "COLLABORATOR";

export interface Actor {
  id: string;
  role: RoleName;
  active: boolean;
}

export interface LeadershipLink {
  id: string;
  managerId: string | null;
}

/** IDs de todas as pessoas lideradas (direta ou indiretamente) por `leaderId`. */
export function subordinateIds(leaderId: string, users: LeadershipLink[]): Set<string> {
  const byManager = new Map<string, string[]>();
  for (const u of users) {
    if (!u.managerId) continue;
    const list = byManager.get(u.managerId) ?? [];
    list.push(u.id);
    byManager.set(u.managerId, list);
  }
  const result = new Set<string>();
  const stack = [...(byManager.get(leaderId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === leaderId || result.has(id)) continue; // protege contra ciclos
    result.add(id);
    stack.push(...(byManager.get(id) ?? []));
  }
  return result;
}

export interface AccessContext {
  actor: Actor;
  /** Liderados do ator (só relevante para coordenadores). */
  subordinates: Set<string>;
}

export function buildAccessContext(actor: Actor, users: LeadershipLink[]): AccessContext {
  return {
    actor,
    subordinates: actor.role === "COORDINATOR" ? subordinateIds(actor.id, users) : new Set(),
  };
}

export const isAdmin = (ctx: AccessContext) => ctx.actor.active && ctx.actor.role === "ADMIN";

function leads(ctx: AccessContext, targetUserId: string) {
  return ctx.actor.role === "COORDINATOR" && ctx.subordinates.has(targetUserId);
}

/** Pode ver dados (check-ins, indicadores, metas, feedbacks, notas) da pessoa? */
export function canViewUser(ctx: AccessContext, targetUserId: string): boolean {
  if (!ctx.actor.active) return false;
  if (isAdmin(ctx)) return true;
  if (ctx.actor.id === targetUserId) return true;
  return leads(ctx, targetUserId);
}

/** IDs visíveis para o ator (null = todos). */
export function visibleUserIds(ctx: AccessContext): Set<string> | null {
  if (isAdmin(ctx)) return null;
  return new Set([ctx.actor.id, ...(ctx.actor.role === "COORDINATOR" ? ctx.subordinates : [])]);
}

/** Pode registrar feedback/reconhecimento e redigir revisões para a pessoa? */
export function canGiveFeedback(ctx: AccessContext, targetUserId: string): boolean {
  if (!ctx.actor.active) return false;
  if (ctx.actor.id === targetUserId) return false; // ninguém se auto-avalia por feedback
  if (isAdmin(ctx)) return true;
  return leads(ctx, targetUserId);
}

export const canWriteReview = canGiveFeedback;

/** Reabrir revisão finalizada: somente administrador (com justificativa). */
export function canReopenReview(ctx: AccessContext): boolean {
  return isAdmin(ctx);
}

/** Gerenciar pessoas, áreas, indicadores de área, pesos e projetos. */
export function canManageOrganization(ctx: AccessContext): boolean {
  return isAdmin(ctx);
}

/** Registrar/editar o check-in de `ownerId` na data informada. */
export function canEditCheckIn(ctx: AccessContext, ownerId: string, date: DayKey, today: DayKey): EditDecision {
  if (!ctx.actor.active) return { allowed: false, reason: "Usuário inativo." };
  if (isAdmin(ctx)) return checkInEditDecision({ date, today, isAdmin: true });
  if (ctx.actor.id !== ownerId) {
    return { allowed: false, reason: "Você só pode registrar o seu próprio check-in." };
  }
  return checkInEditDecision({ date, today, isAdmin: false });
}

/** Excluir check-in: apenas administrador. */
export function canDeleteCheckIn(ctx: AccessContext): boolean {
  return isAdmin(ctx);
}

/** Criar tarefa/meta atribuída a `assigneeId`. */
export function canAssignTask(ctx: AccessContext, assigneeId: string): boolean {
  if (!ctx.actor.active) return false;
  return isAdmin(ctx) || ctx.actor.id === assigneeId || leads(ctx, assigneeId);
}

/** Editar tarefa (status, prazo, descrição). */
export function canEditTask(ctx: AccessContext, task: { assigneeId: string; createdById: string }): boolean {
  if (!ctx.actor.active) return false;
  return isAdmin(ctx) || ctx.actor.id === task.assigneeId || leads(ctx, task.assigneeId);
}

export function canDeleteTask(ctx: AccessContext, task: { assigneeId: string; createdById: string }): boolean {
  if (!ctx.actor.active) return false;
  if (isAdmin(ctx)) return true;
  // quem criou pode excluir se ainda tiver acesso à pessoa responsável
  return task.createdById === ctx.actor.id && canEditTask(ctx, task);
}

/** Resolver bloqueio de um check-in (marcar como resolvido). */
export function canResolveBlocker(ctx: AccessContext, ownerId: string): boolean {
  return canViewUser(ctx, ownerId);
}

/** Gerenciar indicador pessoal (ex.: indicadores livres do CEO). */
export function canManagePersonalIndicator(
  ctx: AccessContext,
  ownerId: string,
  areaAllowsPersonal: boolean,
): boolean {
  if (isAdmin(ctx)) return true;
  return ctx.actor.active && ctx.actor.id === ownerId && areaAllowsPersonal;
}

/** Ver trilha de auditoria referente a uma pessoa (transparência LGPD: a própria pessoa vê). */
export function canViewAuditFor(ctx: AccessContext, subjectUserId: string): boolean {
  return canViewUser(ctx, subjectUserId);
}
