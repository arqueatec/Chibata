/**
 * Editais: etapas, alertas de prazo e números do painel. Funções puras (testáveis sem banco).
 */
import { addDays, type DayKey } from "./dates";

export const GRANT_STATUSES = ["PROSPECT", "PREPARING", "SUBMITTED", "APPROVED", "REJECTED", "EXECUTING", "REPORTING", "CLOSED", "WITHDRAWN"] as const;
export type GrantStatus = (typeof GRANT_STATUSES)[number];

export const GRANT_STATUS_LABEL: Record<GrantStatus, string> = {
  PROSPECT: "Em análise",
  PREPARING: "Em preparação",
  SUBMITTED: "Submetido",
  APPROVED: "Aprovado",
  REJECTED: "Não aprovado",
  EXECUTING: "Em execução",
  REPORTING: "Prestação de contas",
  CLOSED: "Encerrado",
  WITHDRAWN: "Desistência",
};

export const GRANT_STATUS_TONE: Record<GrantStatus, "gray" | "blue" | "yellow" | "green" | "red" | "brand"> = {
  PROSPECT: "gray",
  PREPARING: "yellow",
  SUBMITTED: "blue",
  APPROVED: "green",
  REJECTED: "red",
  EXECUTING: "brand",
  REPORTING: "brand",
  CLOSED: "gray",
  WITHDRAWN: "gray",
};

export const GRANT_ITEM_KINDS = ["DELIVERABLE", "REPORT", "INSTALLMENT"] as const;
export type GrantItemKind = (typeof GRANT_ITEM_KINDS)[number];
export const GRANT_ITEM_LABEL: Record<GrantItemKind, string> = {
  DELIVERABLE: "Meta / entrega",
  REPORT: "Relatório / prestação de contas",
  INSTALLMENT: "Parcela a receber",
};

/** Antes da submissão: o que importa é o prazo de submissão. */
export const PRE_SUBMISSION: readonly GrantStatus[] = ["PROSPECT", "PREPARING"];
/** Aprovado e em andamento: metas, relatórios e parcelas são acompanhados. */
export const ACTIVE_PROJECT: readonly GrantStatus[] = ["APPROVED", "EXECUTING", "REPORTING"];
/** Etapas que contam como "foi submetido" (para a taxa de aprovação). */
export const DECIDED: readonly GrantStatus[] = ["APPROVED", "REJECTED", "EXECUTING", "REPORTING", "CLOSED"];
export const WAS_APPROVED: readonly GrantStatus[] = ["APPROVED", "EXECUTING", "REPORTING", "CLOSED"];

/** Dias de antecedência para o alerta de prazo. */
export const GRANT_ALERT_DAYS = 7;
export const GRANT_URGENT_DAYS = 3;

export interface GrantForAlerts {
  id: string;
  title: string;
  status: GrantStatus;
  submissionDeadline: DayKey | null;
  items: { title: string; kind: GrantItemKind; dueDate: DayKey | null; done: boolean }[];
}

export interface GrantAlert {
  severity: "high" | "medium";
  text: string;
  href: string;
  /** Prazo que gerou o alerta (para ordenar). */
  due: DayKey;
}

const daysBetween = (from: DayKey, to: DayKey) => Math.round((Date.parse(to) - Date.parse(from)) / 86400_000);

function whenText(today: DayKey, due: DayKey) {
  const d = daysBetween(today, due);
  if (d < 0) return `venceu há ${-d} dia(s)`;
  if (d === 0) return "vence hoje";
  if (d === 1) return "vence amanhã";
  return `vence em ${d} dias`;
}

/** Alertas: prazo de submissão próximo/vencido e itens (metas, relatórios, parcelas) de projetos aprovados. */
export function grantAlerts(grants: GrantForAlerts[], today: DayKey): GrantAlert[] {
  const limit = addDays(today, GRANT_ALERT_DAYS);
  const urgent = addDays(today, GRANT_URGENT_DAYS);
  const out: GrantAlert[] = [];
  for (const g of grants) {
    const href = `/editais/${g.id}`;
    if (PRE_SUBMISSION.includes(g.status) && g.submissionDeadline && g.submissionDeadline <= limit) {
      out.push({
        severity: g.submissionDeadline <= urgent ? "high" : "medium",
        text: `Edital “${g.title}”: submissão ${whenText(today, g.submissionDeadline)} (${GRANT_STATUS_LABEL[g.status].toLowerCase()}).`,
        href,
        due: g.submissionDeadline,
      });
    }
    if (ACTIVE_PROJECT.includes(g.status)) {
      for (const it of g.items) {
        if (it.done || !it.dueDate || it.dueDate > limit) continue;
        out.push({
          severity: it.dueDate < today ? "high" : "medium",
          text: `Edital “${g.title}”: ${GRANT_ITEM_LABEL[it.kind].toLowerCase()} “${it.title}” ${whenText(today, it.dueDate)}.`,
          href,
          due: it.dueDate,
        });
      }
    }
  }
  return out.sort((a, b) => (a.severity === b.severity ? a.due.localeCompare(b.due) : a.severity === "high" ? -1 : 1));
}

export interface GrantForStats {
  status: GrantStatus;
  requestedAmount: number | null;
  approvedAmount: number | null;
  /** Mudanças de etapa com o dia em que ocorreram. */
  changes: { toStatus: GrantStatus; day: DayKey }[];
}

/** Números do painel para um período [from, to]. */
export function grantStats(grants: GrantForStats[], from: DayKey, to: DayKey) {
  const inRange = (d: DayKey) => d >= from && d <= to;
  const firstDay = (g: GrantForStats, statuses: readonly GrantStatus[]) =>
    g.changes.filter((c) => statuses.includes(c.toStatus)).map((c) => c.day).sort()[0] ?? null;
  let submitted = 0;
  let approved = 0;
  let rejected = 0;
  let approvedAmount = 0;
  for (const g of grants) {
    const sub = firstDay(g, ["SUBMITTED"]);
    if (sub && inRange(sub)) submitted++;
    const appr = firstDay(g, ["APPROVED"]);
    if (appr && inRange(appr)) {
      approved++;
      approvedAmount += g.approvedAmount ?? 0;
    }
    const rej = firstDay(g, ["REJECTED"]);
    if (rej && inRange(rej)) rejected++;
  }
  const decided = approved + rejected;
  return {
    submitted,
    approved,
    rejected,
    approvedAmount,
    /** Aprovados ÷ (aprovados + não aprovados) com resultado no período; null sem resultados. */
    approvalRate: decided > 0 ? approved / decided : null,
    pending: grants.filter((g) => g.status === "SUBMITTED").length,
    pendingAmount: grants.filter((g) => g.status === "SUBMITTED").reduce((s, g) => s + (g.requestedAmount ?? 0), 0),
    inPreparation: grants.filter((g) => PRE_SUBMISSION.includes(g.status)).length,
    active: grants.filter((g) => ACTIVE_PROJECT.includes(g.status)).length,
  };
}
