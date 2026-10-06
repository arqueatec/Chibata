import { NextResponse, type NextRequest } from "next/server";
import { getAccess } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { addDays, isDayKey, todayKey } from "@/lib/domain/dates";
import { ENTITY_LABEL } from "@/lib/format";
import { auditSheet } from "@/lib/services/auditExport";
import { buildWorkbook, startOfDayInTz, xlsxResponse } from "@/lib/services/excel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Exporta a trilha de auditoria (Excel) com os mesmos filtros da tela. */
export async function GET(req: NextRequest) {
  const access = await getAccess();
  if (!access) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!access.isAdmin) return NextResponse.json({ error: "Somente o administrador pode exportar a auditoria." }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const tipo = sp.get("tipo");
  const pessoa = sp.get("pessoa");
  const de = sp.get("de");
  const ate = sp.get("ate");
  if ((de && !isDayKey(de)) || (ate && !isDayKey(ate))) return NextResponse.json({ error: "Data inválida." }, { status: 400 });

  const sheet = await auditSheet({
    entityType: tipo && tipo in ENTITY_LABEL ? tipo : undefined,
    subjectUserIds: pessoa ? [pessoa] : undefined,
    from: de ? startOfDayInTz(de) : undefined,
    to: ate ? startOfDayInTz(addDays(ate, 1)) : undefined,
  });
  const buf = await buildWorkbook([sheet], { title: "Auditoria — ArqueaTec", author: access.user.name });
  await audit({ actorId: access.user.id, entityType: "Export", entityId: "auditoria", action: "EXPORT", after: { tipo, pessoa, de, ate, linhas: sheet.rows.length } });
  return xlsxResponse(buf, `arqueatec-auditoria_${todayKey()}.xlsx`);
}
