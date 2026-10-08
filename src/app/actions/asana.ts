"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { formToObject, safeAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { AuthorizationError, requireActionAccess } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { canManageOrganization } from "@/lib/domain/access";
import { asanaEnabled, getAsanaSettings, saveAsanaSettings, syncAsana, type SyncReport } from "@/lib/asana/sync";

async function requireAdmin() {
  const a = await requireActionAccess();
  if (!canManageOrganization(a.ctx)) throw new AuthorizationError("Somente o administrador pode configurar a integração.");
  return a;
}

const gid = z.string().regex(/^\d{1,30}$/, { message: "Identificador do Asana inválido." });

export const saveAsanaProjects = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireAdmin();
  const raw = formToObject(fd);
  const workspaceGid = gid.parse(raw.workspaceGid);
  const projects = raw.project === undefined ? [] : Array.isArray(raw.project) ? raw.project : [raw.project];
  const projectGids = z.array(gid).max(50).parse(projects);
  const before = await getAsanaSettings();
  await saveAsanaSettings({ workspaceGid, projectGids });
  await audit({
    actorId: access.user.id,
    entityType: "Integration",
    entityId: "asana",
    action: "UPDATE",
    before: { projetos: before.projectGids },
    after: { projetos: projectGids },
  });
  revalidatePath("/admin/asana");
  return { ok: true, message: `${projectGids.length} projeto(s) selecionado(s). Clique em “Sincronizar agora” para importar.` };
});

export const saveAsanaWorkspace = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireAdmin();
  const workspaceGid = gid.parse(fd.get("workspaceGid"));
  const before = await getAsanaSettings();
  if (before.workspaceGid === workspaceGid) return { ok: true, message: "Este espaço de trabalho já está em uso." };
  // Projetos pertencem a um espaço: ao trocar, a seleção anterior deixa de valer
  await saveAsanaSettings({ workspaceGid, projectGids: [] });
  await audit({
    actorId: access.user.id,
    entityType: "Integration",
    entityId: "asana",
    action: "UPDATE",
    before: { espaco: before.workspaceGid ?? null },
    after: { espaco: workspaceGid },
  });
  revalidatePath("/admin/asana");
  return { ok: true, message: "Espaço de trabalho atualizado. Agora escolha os projetos abaixo." };
});

export const saveAsanaPeople = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const access = await requireAdmin();
  const raw = formToObject(fd);
  const count = z.coerce.number().int().min(0).max(500).parse(raw.count ?? 0);
  const users = await prisma.user.findMany({ select: { id: true, name: true, asanaEmails: true } });
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
    if (JSON.stringify(next) === JSON.stringify([...u.asanaEmails].sort())) continue;
    await prisma.user.update({ where: { id: u.id }, data: { asanaEmails: next } });
    await audit({ actorId: access.user.id, subjectUserId: u.id, entityType: "User", entityId: u.id, action: "UPDATE", before: { asanaEmails: u.asanaEmails }, after: { asanaEmails: next } });
    changed++;
  }
  revalidatePath("/admin/asana");
  return { ok: true, message: changed ? `Vínculos atualizados para ${changed} pessoa(s).` : "Nada a alterar." };
});

function summary(r: SyncReport) {
  if (!r.ok) return { ok: false, message: `A sincronização falhou: ${r.error}` };
  const parts = [`${r.created} criada(s)`, `${r.updated} atualizada(s)`];
  if (r.linked) parts.push(`${r.linked} vinculada(s) a metas já existentes`);
  if (r.removed) parts.push(`${r.removed} removida(s)`);
  let msg = `Sincronizado: ${parts.join(", ")} em ${r.projects} projeto(s).`;
  if (r.unmappedEmails.length) msg += ` Sem pessoa vinculada: ${r.unmappedEmails.join(", ")}.`;
  return { ok: true, message: msg };
}

export const runAsanaSync = safeAction(async () => {
  const access = await requireAdmin();
  const r = await syncAsana({ actorId: access.user.id, trigger: "manual" });
  revalidatePath("/", "layout");
  return summary(r);
});

/** Qualquer pessoa pode pedir uma atualização (ex.: no check-in), no máximo a cada 2 minutos. */
export const refreshFromAsana = safeAction(async () => {
  await requireActionAccess();
  if (!(await asanaEnabled())) throw new UserFacingError("A integração com o Asana não está ativa.");
  const last = (await getAsanaSettings()).lastSync;
  if (last && Date.now() - new Date(last.at).getTime() < 2 * 60_000) {
    return { ok: true, message: "Os dados do Asana foram atualizados há menos de 2 minutos." };
  }
  const r = await syncAsana({ actorId: null, trigger: "checkin" });
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, message: "Atualizado com o Asana." } : { ok: false, message: `Não foi possível atualizar: ${r.error}` };
});
