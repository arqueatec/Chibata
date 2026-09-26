import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

type Tx = Prisma.TransactionClient | PrismaClient;

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "FINALIZE" | "REOPEN" | "RESOLVE" | "EXPORT" | "LOGIN";

export interface AuditInput {
  actorId: string | null;
  subjectUserId?: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/** Remove campos sensíveis e converte datas para JSON estável. */
function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (key, v) => (key === "passwordHash" || key === "tokenHash" ? undefined : v)),
  ) as Prisma.InputJsonValue;
}

export async function audit(input: AuditInput, tx: Tx = prisma) {
  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      subjectUserId: input.subjectUserId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      before: sanitize(input.before),
      after: sanitize(input.after),
      reason: input.reason ?? null,
    },
  });
}

/** Retorna apenas os campos que mudaram (para registrar valor anterior e novo de forma enxuta). */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    const bv = before[k];
    const av = after[k];
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
    if (JSON.stringify(norm(bv)) !== JSON.stringify(norm(av))) {
      b[k] = bv;
      a[k] = av;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
