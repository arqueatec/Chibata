"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { safeAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { requireActionAccess } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { hashToken } from "@/lib/auth/tokens";
import { checkbox } from "@/lib/validation";

export const updatePreferences = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const { user } = await requireActionAccess();
  const reminderEnabled = checkbox.parse(fd.get("reminderEnabled") ?? undefined);
  await prisma.user.update({ where: { id: user.id }, data: { reminderEnabled } });
  revalidatePath("/meus-dados");
  return { ok: true, message: reminderEnabled ? "Lembretes de check-in ativados." : "Lembretes desativados." };
});

export const changePassword = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const { user } = await requireActionAccess();
  const current = z.string().max(200).parse(fd.get("current") ?? "");
  const next = z
    .string()
    .min(MIN_PASSWORD_LENGTH, { message: `A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` })
    .max(200)
    .parse(fd.get("next") ?? "");
  const full = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (full.passwordHash && !(await verifyPassword(current, full.passwordHash))) throw new UserFacingError("Senha atual incorreta.");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } }),
    // encerra as outras sessões
    prisma.session.deleteMany({ where: { userId: user.id, NOT: token ? { tokenHash: hashToken(token) } : undefined } }),
  ]);
  await audit({ actorId: user.id, subjectUserId: user.id, entityType: "User", entityId: user.id, action: "UPDATE", after: { senha: "alterada" } });
  return { ok: true, message: "Senha alterada. Outras sessões foram encerradas." };
});

export const logoutOtherSessions = safeAction(async () => {
  const { user } = await requireActionAccess();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const r = await prisma.session.deleteMany({ where: { userId: user.id, NOT: token ? { tokenHash: hashToken(token) } : undefined } });
  return { ok: true, message: `${r.count} sessão(ões) encerrada(s).` };
});
