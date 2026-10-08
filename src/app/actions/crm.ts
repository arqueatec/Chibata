"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { formToObject, safeAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { AuthorizationError, requireActionAccess } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { canManageOrganization } from "@/lib/domain/access";
import { syncCrm } from "@/lib/crm/sync";

async function requireAdmin() {
  const a = await requireActionAccess();
  if (!canManageOrganization(a.ctx)) throw new AuthorizationError("Somente o administrador pode configurar a integração.");
  return a;
}

export const runCrmSync = safeAction(async () => {
  const access = await requireAdmin();
  const r = await syncCrm({ actorId: access.user.id, trigger: "manual" });
  revalidatePath("/", "layout");
  if (!r.ok) return { ok: false, message: `A sincronização falhou: ${r.error}` };
  return {
    ok: true,
    message: `Sincronizado: ${r.accounts} conta(s) e ${r.events} evento(s) dos últimos 60 dias.${r.unmappedEmails.length ? ` Sem pessoa vinculada: ${r.unmappedEmails.join(", ")}.` : ""}`,
  };
});

/** Vincula cada conta da equipe do CRM a uma pessoa do Chibata (User.crmEmails). */
export const saveCrmPeople = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireAdmin();
  const raw = formToObject(fd);
  const count = z.coerce.number().int().min(0).max(500).parse(raw.count ?? 0);
  const users = await prisma.user.findMany({ select: { id: true, email: true, crmEmails: true } });
  const byUser = new Map<string, Set<string>>(users.map((u) => [u.id, new Set<string>()]));
  for (let i = 0; i < count; i++) {
    const email = z.email().safeParse(String(raw[`email_${i}`] ?? "").trim().toLowerCase());
    const userId = String(raw[`user_${i}`] ?? "");
    if (!email.success || !userId) continue;
    if (!byUser.has(userId)) throw new UserFacingError("Pessoa inválida.");
    byUser.get(userId)!.add(email.data);
  }
  let changed = 0;
  for (const u of users) {
    const next = [...byUser.get(u.id)!].sort();
    if (JSON.stringify(next) === JSON.stringify([...u.crmEmails].sort())) continue;
    await prisma.user.update({ where: { id: u.id }, data: { crmEmails: next } });
    await audit({ actorId: access.user.id, subjectUserId: u.id, entityType: "User", entityId: u.id, action: "UPDATE", before: { crmEmails: u.crmEmails }, after: { crmEmails: next } });
    changed++;
  }
  revalidatePath("/", "layout");
  return { ok: true, message: changed ? `Vínculos atualizados para ${changed} pessoa(s).` : "Nada a alterar." };
});
