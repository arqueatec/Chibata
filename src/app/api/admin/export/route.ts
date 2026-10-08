import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getAccess } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { addDays, isDayKey, todayKey } from "@/lib/domain/dates";
import { buildWorkbook, xlsxResponse } from "@/lib/services/excel";
import { buildTeamExport, MAX_EXPORT_DAYS } from "@/lib/services/teamExport";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Exportação da equipe (Excel) para o administrador: período + pessoas ou área. */
export async function GET(req: NextRequest) {
  const access = await getAccess();
  if (!access) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!access.isAdmin) return NextResponse.json({ error: "Somente o administrador pode exportar os dados da equipe." }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const today = todayKey();
  const from = sp.get("de") ?? "";
  const to = sp.get("ate") ?? "";
  if (!isDayKey(from) || !isDayKey(to)) return NextResponse.json({ error: "Informe as datas inicial e final." }, { status: 400 });
  if (from > to) return NextResponse.json({ error: "A data inicial deve ser anterior à final." }, { status: 400 });
  if (addDays(from, MAX_EXPORT_DAYS) < to) return NextResponse.json({ error: `O período máximo é de ${MAX_EXPORT_DAYS} dias.` }, { status: 400 });
  const end = to > today ? today : to;

  const pessoa = sp.get("pessoa") || undefined;
  const area = sp.get("area") || undefined;
  const users = await prisma.user.findMany({
    where: { ...(pessoa ? { id: pessoa } : {}), ...(area ? { areaId: area } : {}), ...(sp.get("inativos") ? {} : { active: true }) },
    select: { id: true },
  });
  if (users.length === 0) return NextResponse.json({ error: "Nenhuma pessoa encontrada para os filtros escolhidos." }, { status: 404 });

  const sheets = await buildTeamExport({ from, to: end, userIds: users.map((u) => u.id), generatedBy: access.user.name });
  const buf = await buildWorkbook(sheets, { title: "Acompanhamento de desempenho — ArqueaTec", author: access.user.name });
  await audit({
    actorId: access.user.id,
    entityType: "Export",
    entityId: `${from}_${end}`,
    action: "EXPORT",
    after: { de: from, ate: end, pessoas: users.length, area: area ?? null, pessoa: pessoa ?? null },
  });
  return xlsxResponse(buf, `arqueatec-desempenho_${from}_a_${end}.xlsx`);
}
