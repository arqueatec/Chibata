"use server";

import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { safeAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { seedDemo } from "@/lib/seed/demo";

function secretMatches(given: string) {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected) throw new UserFacingError("Defina a variável CRON_SECRET no servidor antes da configuração inicial.");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const schema = z.object({
  secret: z.string().min(1, { message: "Informe o código de configuração." }),
  mode: z.enum(["demo", "admin"]),
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().toLowerCase().optional(),
  password: z.string().min(MIN_PASSWORD_LENGTH, { message: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` }).max(200),
});

/** Configuração inicial: só funciona com o banco sem nenhuma pessoa cadastrada. */
export const runSetup = safeAction(async (_prev: ActionResult, fd: FormData) => {
  const d = schema.parse(Object.fromEntries(fd));
  if (!secretMatches(d.secret)) throw new UserFacingError("Código de configuração incorreto.");
  if ((await prisma.user.count()) > 0) throw new UserFacingError("O sistema já foi configurado.");

  if (d.mode === "demo") {
    await seedDemo(prisma, { password: d.password });
  } else {
    const name = z.string().min(1, { message: "Informe o nome." }).parse(d.name ?? "");
    const email = z.email({ message: "E-mail inválido." }).parse(d.email ?? "");
    const area = await prisma.area.create({ data: { name: "Direção", allowPersonalIndicators: true } });
    const u = await prisma.user.create({
      data: { name, email, role: "ADMIN", jobTitle: "CEO", areaId: area.id, passwordHash: await hashPassword(d.password) },
    });
    await audit({ actorId: u.id, subjectUserId: u.id, entityType: "User", entityId: u.id, action: "CREATE", after: { name, email, role: "ADMIN" } });
  }
  redirect("/login");
});
