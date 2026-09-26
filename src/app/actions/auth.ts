"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { safeAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { createSession, destroySession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { appUrl, emailConfigured, sendEmail } from "@/lib/email";
import { audit } from "@/lib/audit";

const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ message: "Informe um e-mail válido." }));

const MAX_FAILED_LOGINS = 8;
const FAILED_WINDOW_MIN = 15;

export const loginWithPassword = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const email = emailSchema.parse(fd.get("email") ?? "");
  const password = z.string().min(1, { message: "Informe a senha." }).max(200).parse(fd.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });

  // Limite simples de tentativas por conta (persistido no banco, funciona em serverless)
  if (user) {
    const since = new Date(Date.now() - FAILED_WINDOW_MIN * 60_000);
    const failures = await prisma.auditLog.count({
      where: { entityType: "User", entityId: user.id, action: "LOGIN", reason: "falha", createdAt: { gte: since } },
    });
    if (failures >= MAX_FAILED_LOGINS) {
      throw new UserFacingError(`Muitas tentativas. Aguarde ${FAILED_WINDOW_MIN} minutos ou use o link de acesso por e-mail.`);
    }
  }

  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !user.active || !ok) {
    if (user) await audit({ actorId: null, entityType: "User", entityId: user.id, action: "LOGIN", reason: "falha" });
    throw new UserFacingError("E-mail ou senha incorretos.");
  }
  await createSession(user.id);
  redirect("/");
});

export const requestMagicLink = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const email = emailSchema.parse(fd.get("email") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  const generic = { ok: true, message: "Se o e-mail estiver cadastrado, você receberá um link de acesso válido por 15 minutos." };
  if (!user || !user.active) return generic;

  const recent = await prisma.magicLinkToken.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
  if (recent >= 3) return generic;

  const token = newToken();
  await prisma.magicLinkToken.create({
    data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + 15 * 60_000) },
  });
  const link = `${appUrl()}/auth/magic?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: "Seu link de acesso — ArqueaTec Desempenho",
    text: `Olá, ${user.name}!\n\nUse o link abaixo para entrar (válido por 15 minutos):\n${link}\n\nSe você não pediu este acesso, ignore este e-mail.`,
    html: `<p>Olá, ${escapeHtml(user.name)}!</p><p><a href="${link}">Clique aqui para entrar</a> (válido por 15 minutos).</p><p>Se você não pediu este acesso, ignore este e-mail.</p>`,
  });
  if (!emailConfigured() && process.env.NODE_ENV === "production") {
    return { ok: false, message: "Envio de e-mail não configurado neste ambiente. Use a senha." };
  }
  return generic;
});

export const consumeMagicLink = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const token = z.string().min(20).max(200).parse(fd.get("token") ?? "");
  const row = await prisma.magicLinkToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.active) {
    throw new UserFacingError("Link inválido ou expirado. Solicite um novo.");
  }
  // uso único (condição evita corrida entre duas requisições)
  const used = await prisma.magicLinkToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count === 0) throw new UserFacingError("Link já utilizado.");
  await createSession(row.userId);
  redirect("/");
});

export async function logout() {
  await destroySession();
  redirect("/login");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
