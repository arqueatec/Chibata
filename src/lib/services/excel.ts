import "server-only";
import ExcelJS from "exceljs";

export interface SheetColumn {
  header: string;
  key: string;
  width?: number;
  /** Formato numérico do Excel (ex.: "dd/mm/yyyy", "0.0", "0%"). */
  numFmt?: string;
  wrap?: boolean;
}

export interface SheetSpec {
  name: string;
  columns: SheetColumn[];
  rows: Record<string, unknown>[];
}

export const FMT_DATE = "dd/mm/yyyy";
export const FMT_DATETIME = "dd/mm/yyyy hh:mm";
export const FMT_NUM = "#,##0.##";
export const FMT_SCORE = "0.0";

/**
 * Datas e horas: o Excel não guarda fuso horário. Convertemos instantes para a "hora de parede"
 * do fuso do app, para que a planilha mostre o mesmo horário que a tela.
 */
export function excelLocal(d: Date | null | undefined, timeZone = process.env.APP_TIMEZONE || "America/Sao_Paulo"): Date | null {
  if (!d) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second));
}

/** Gera um .xlsx com cabeçalho destacado, filtros e primeira linha congelada em cada aba. */
export async function buildWorkbook(sheets: SheetSpec[], meta: { title: string; author: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.author;
  wb.title = meta.title;
  wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = s.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16, style: c.numFmt ? { numFmt: c.numFmt } : {} }));
    for (const r of s.rows) ws.addRow(r);
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E3D44" } };
    header.alignment = { vertical: "middle" };
    s.columns.forEach((c, i) => {
      if (c.wrap) ws.getColumn(i + 1).alignment = { wrapText: true, vertical: "top" };
    });
    if (s.rows.length > 0 && s.columns.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function xlsxResponse(buf: Buffer, filename: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Instante em que começa o dia `key` (AAAA-MM-DD) no fuso do app. */
export function startOfDayInTz(key: string): Date {
  const utcMidnight = new Date(`${key}T00:00:00.000Z`);
  const offset = excelLocal(utcMidnight)!.getTime() - utcMidnight.getTime();
  return new Date(utcMidnight.getTime() - offset);
}
