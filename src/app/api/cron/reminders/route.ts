import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { isBusinessDay, keyToDate, todayKey } from "@/lib/domain/dates";
import { appUrl, emailConfigured, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/** Lembrete diário de check-in (Vercel Cron). Envia só para quem optou e ainda não registrou o dia. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const today = todayKey();
  if (!isBusinessDay(today)) return NextResponse.json({ skipped: "fim de semana" });
  if (!emailConfigured()) return NextResponse.json({ skipped: "e-mail não configurado" });

  const pending = await prisma.user.findMany({
    where: { active: true, reminderEnabled: true, checkIns: { none: { date: keyToDate(today) } } },
    select: { name: true, email: true },
  });
  let sent = 0;
  for (const u of pending) {
    const ok = await sendEmail({
      to: u.email,
      subject: "Lembrete: check-in de hoje",
      text: `Olá, ${u.name}! Seu check-in de hoje ainda está pendente. Leva menos de 3 minutos: ${appUrl()}/checkin\n\nPara parar de receber, desative em Meus dados.`,
      html: `<p>Olá, ${u.name}!</p><p>Seu check-in de hoje ainda está pendente. Leva menos de 3 minutos.</p><p><a href="${appUrl()}/checkin">Fazer check-in</a></p><p style="color:#666;font-size:12px">Para parar de receber, desative em “Meus dados”.</p>`,
    });
    if (ok) sent++;
  }
  return NextResponse.json({ pending: pending.length, sent });
}
