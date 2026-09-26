import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { buildAccessContext, canViewUser, isAdmin, visibleUserIds, type AccessContext } from "@/lib/domain/access";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";

export class AuthorizationError extends Error {
  constructor(message = "Você não tem permissão para esta ação.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export interface Access {
  user: CurrentUser;
  ctx: AccessContext;
  isAdmin: boolean;
  /** IDs visíveis (null = todos). */
  visible: Set<string> | null;
}

/** Carrega o usuário e o contexto de acesso (hierarquia vinda do banco). */
export const getAccess = cache(async (): Promise<Access | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const links = await prisma.user.findMany({ select: { id: true, managerId: true } });
  const ctx = buildAccessContext({ id: user.id, role: user.role, active: user.active }, links);
  return { user, ctx, isAdmin: isAdmin(ctx), visible: visibleUserIds(ctx) };
});

/** Para páginas: redireciona ao login se não autenticado. */
export async function requireAccess(): Promise<Access> {
  const a = await getAccess();
  if (!a) redirect("/login");
  return a;
}

/** Para server actions: lança erro se não autenticado. */
export async function requireActionAccess(): Promise<Access> {
  const a = await getAccess();
  if (!a) throw new AuthorizationError("Sessão expirada. Entre novamente.");
  return a;
}

export async function requireAdminPage(): Promise<Access> {
  const a = await requireAccess();
  if (!a.isAdmin) notFound();
  return a;
}

export function assertCanView(a: Access, userId: string) {
  if (!canViewUser(a.ctx, userId)) throw new AuthorizationError();
}

/** Filtro Prisma para restringir consultas às pessoas visíveis. */
export function visibleWhere(a: Access): { in: string[] } | undefined {
  return a.visible ? { in: [...a.visible] } : undefined;
}
