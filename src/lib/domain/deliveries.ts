/**
 * Entregas (tarefas concluídas): evidência, contestação pelo líder e o que conta na nota. Funções puras.
 */
import { businessDaysAfter, type DayKey } from "./dates";

/** Prazo, em dias úteis após a conclusão, para o líder contestar uma entrega (igual à janela do check-in). */
export const CONTEST_WINDOW_BUSINESS_DAYS = 2;

export interface DeliveryLike {
  status: string;
  evidenceUrl: string | null;
  asanaAttachments: number;
  requiresEvidence: boolean;
  contestedAt: Date | null;
}

export const hasEvidence = (t: Pick<DeliveryLike, "evidenceUrl" | "asanaAttachments">) => !!t.evidenceUrl || t.asanaAttachments > 0;

/** Conta como concluída na nota: concluída, não contestada e, se exigir, com evidência. */
export function countsAsDone(t: DeliveryLike) {
  return t.status === "DONE" && !t.contestedAt && (!t.requiresEvidence || hasEvidence(t));
}

/** Motivo de uma entrega concluída não contar (ou null se conta). */
export function notCountingReason(t: DeliveryLike): string | null {
  if (t.status !== "DONE") return null;
  if (t.contestedAt) return "contestada pelo líder";
  if (t.requiresEvidence && !hasEvidence(t)) return "falta evidência";
  return null;
}

/** O líder ainda pode contestar? (até N dias úteis depois do dia da conclusão) */
export function canStillContest(completedOn: DayKey, today: DayKey) {
  return businessDaysAfter(completedOn, today) <= CONTEST_WINDOW_BUSINESS_DAYS;
}

/** Proporção de entregas com evidência (null sem entregas). */
export function evidenceRate(done: Pick<DeliveryLike, "evidenceUrl" | "asanaAttachments">[]) {
  if (done.length === 0) return null;
  return done.filter(hasEvidence).length / done.length;
}

/** Link de evidência: só http(s). */
export function normalizeEvidenceUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (!/^https?:\/\/\S+$/i.test(v) || v.length > 1000) throw new Error("Evidência: use um link começando com http:// ou https://.");
  return v;
}
