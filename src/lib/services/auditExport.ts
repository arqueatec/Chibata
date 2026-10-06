import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ACTION_LABEL, ENTITY_LABEL } from "@/lib/format";
import { excelLocal, FMT_DATETIME, type SheetSpec } from "./excel";

export interface AuditFilter {
  entityType?: string;
  subjectUserIds?: string[];
  from?: Date;
  /** exclusivo */
  to?: Date;
}

export function auditWhere(f: AuditFilter): Prisma.AuditLogWhereInput {
  return {
    ...(f.entityType ? { entityType: f.entityType } : {}),
    ...(f.subjectUserIds ? { subjectUserId: { in: f.subjectUserIds } } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } } : {}),
  };
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/**
 * Uma linha por campo alterado (quem, quando, o quê, valor anterior e novo),
 * formato fácil de filtrar no Excel e de analisar no Claude.
 */
export async function auditSheet(f: AuditFilter, limit = 50000): Promise<SheetSpec> {
  const logs = await prisma.auditLog.findMany({
    where: auditWhere(f),
    include: { actor: { select: { name: true } }, subjectUser: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const rows: Record<string, unknown>[] = [];
  for (const a of logs) {
    const before = (a.before ?? {}) as Record<string, unknown>;
    const after = (a.after ?? {}) as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    const base = {
      quando: excelLocal(a.createdAt),
      autor: a.actor?.name ?? "sistema",
      pessoa: a.subjectUser?.name ?? "",
      registro: ENTITY_LABEL[a.entityType] ?? a.entityType,
      acao: ACTION_LABEL[a.action] ?? a.action,
      justificativa: a.reason ?? "",
      idRegistro: a.entityId,
    };
    if (keys.length === 0) rows.push({ ...base, campo: "", anterior: "", novo: "" });
    for (const k of keys) rows.push({ ...base, campo: k, anterior: cell(before[k]), novo: cell(after[k]) });
  }
  return {
    name: "Auditoria",
    columns: [
      { header: "Quando", key: "quando", width: 17, numFmt: FMT_DATETIME },
      { header: "Quem fez", key: "autor", width: 16 },
      { header: "Sobre quem", key: "pessoa", width: 16 },
      { header: "Registro", key: "registro", width: 22 },
      { header: "Ação", key: "acao", width: 12 },
      { header: "Campo", key: "campo", width: 18 },
      { header: "Valor anterior", key: "anterior", width: 40, wrap: true },
      { header: "Valor novo", key: "novo", width: 40, wrap: true },
      { header: "Justificativa", key: "justificativa", width: 30, wrap: true },
      { header: "ID do registro", key: "idRegistro", width: 28 },
    ],
    rows,
  };
}
