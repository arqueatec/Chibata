import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getAccess } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { isAdmin } from "@/lib/domain/access";
import { dateToKey, todayKey } from "@/lib/domain/dates";

export const dynamic = "force-dynamic";

/** Exportação dos dados pessoais (portabilidade — LGPD art. 18). Própria pessoa ou administrador. */
export async function GET(req: NextRequest) {
  const access = await getAccess();
  if (!access) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const requested = req.nextUrl.searchParams.get("user") ?? access.user.id;
  if (requested !== access.user.id && !isAdmin(access.ctx)) {
    return NextResponse.json({ error: "Você só pode exportar os próprios dados." }, { status: 403 });
  }
  const user = await prisma.user.findUnique({
    where: { id: requested },
    select: {
      id: true, name: true, email: true, role: true, jobTitle: true, active: true, reminderEnabled: true, createdAt: true,
      area: { select: { name: true } },
      manager: { select: { name: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "Pessoa não encontrada." }, { status: 404 });

  const [checkIns, entries, tasks, feedbackReceived, feedbackGiven, reviews, auditLogs, personalIndicators] = await Promise.all([
    prisma.checkIn.findMany({ where: { userId: requested }, orderBy: { date: "asc" }, omit: { userId: true } }),
    prisma.indicatorEntry.findMany({ where: { userId: requested }, orderBy: { date: "asc" }, include: { indicator: { select: { name: true, unit: true } } } }),
    prisma.task.findMany({ where: { assigneeId: requested }, include: { project: { select: { name: true } }, createdBy: { select: { name: true } } } }),
    prisma.feedback.findMany({ where: { targetUserId: requested }, include: { author: { select: { name: true } } } }),
    prisma.feedback.findMany({ where: { authorId: requested }, include: { targetUser: { select: { name: true } } } }),
    prisma.monthlyReview.findMany({ where: { userId: requested }, include: { finalizedBy: { select: { name: true } } } }),
    prisma.auditLog.findMany({ where: { subjectUserId: requested }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.indicator.findMany({ where: { ownerId: requested } }),
  ]);

  await audit({ actorId: access.user.id, subjectUserId: requested, entityType: "User", entityId: requested, action: "EXPORT" });

  const body = {
    exportadoEm: new Date().toISOString(),
    exportadoPor: access.user.name,
    pessoa: user,
    checkIns: checkIns.map((c) => ({ ...c, date: dateToKey(c.date) })),
    lancamentosIndicadores: entries.map((e) => ({ data: dateToKey(e.date), indicador: e.indicator.name, unidade: e.indicator.unit, valor: e.value })),
    indicadoresPessoais: personalIndicators,
    metasETarefas: tasks.map((t) => ({ ...t, dueDate: t.dueDate ? dateToKey(t.dueDate) : null })),
    feedbacksRecebidos: feedbackReceived,
    feedbacksRegistrados: feedbackGiven,
    revisoesMensais: reviews.map((r) => ({ ...r, month: dateToKey(r.month) })),
    auditoria: auditLogs,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="meus-dados-${user.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${todayKey()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
