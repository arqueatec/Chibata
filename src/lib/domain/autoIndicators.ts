/**
 * Indicadores preenchidos automaticamente a partir das tarefas (sincronizadas do Asana ou criadas no app).
 * Funções puras: recebem as tarefas já carregadas e devolvem o valor do indicador para uma pessoa em um dia.
 */
import { z } from "zod";
import type { DayKey } from "./dates";

export const AUTO_RULE_TYPES = {
  TASKS_COMPLETED: "Tarefas concluídas no dia",
  TASKS_CREATED: "Tarefas criadas no dia",
  TASKS_OVERDUE: "Tarefas atrasadas (abertas com prazo vencido)",
  FIELD_SUM: "Soma de um campo numérico do Asana nas tarefas abertas (valor atual)",
  FIELD_CHANGED_TO: "Vezes em que um campo do Asana mudou para um valor",
  CRM_ACCOUNTS_CREATED: "CRM: contas cadastradas no dia",
  CRM_CONTACTS: "CRM: contatos registrados no dia",
  CRM_STATUS_REACHED: "CRM: contas que entraram numa etapa do funil",
  CRM_LITERS_SOLD: "CRM: litros vendidos",
  CRM_REVENUE: "CRM: receita de vendas (R$)",
  GRANTS_SUBMITTED: "Editais: submetidos no dia",
  GRANTS_APPROVED: "Editais: aprovados no dia",
  GRANTS_APPROVED_AMOUNT: "Editais: valor aprovado (R$)",
} as const;

export const CRM_RULE_TYPES = ["CRM_ACCOUNTS_CREATED", "CRM_CONTACTS", "CRM_STATUS_REACHED", "CRM_LITERS_SOLD", "CRM_REVENUE"] as const;
export const isCrmRule = (t: string) => (CRM_RULE_TYPES as readonly string[]).includes(t);

export const GRANT_RULE_TYPES = ["GRANTS_SUBMITTED", "GRANTS_APPROVED", "GRANTS_APPROVED_AMOUNT"] as const;
export const isGrantRule = (t: string) => (GRANT_RULE_TYPES as readonly string[]).includes(t);

export type AutoRuleType = keyof typeof AUTO_RULE_TYPES;

export const autoRuleSchema = z.object({
  type: z.enum(Object.keys(AUTO_RULE_TYPES) as [AutoRuleType, ...AutoRuleType[]]),
  /** Projetos (IDs do app) considerados; vazio = todos. */
  projectIds: z.array(z.string()).default([]),
  /** Só tarefas cujo título contém este texto (sem diferenciar maiúsculas/acentos). */
  nameContains: z.string().trim().max(120).optional(),
  /** Campo personalizado do Asana (FIELD_SUM e FIELD_CHANGED_TO). */
  field: z.string().trim().max(120).optional(),
  /** Valor-alvo do campo (FIELD_CHANGED_TO) ou etapa do funil (CRM_STATUS_REACHED, ex.: "5." ou "Teste"). */
  value: z.string().trim().max(120).optional(),
  /** CRM: filtro por segmento da conta (texto contido). */
  segment: z.string().trim().max(120).optional(),
  /** CRM: "include" = só o segmento; "exclude" = todos menos o segmento. */
  segmentMode: z.enum(["include", "exclude"]).default("include"),
  /** CRM/editais: "all" = toda a equipe; "person" = só o que a pessoa fez/é responsável. */
  scope: z.enum(["all", "person"]).default("all"),
});

export type AutoRule = z.infer<typeof autoRuleSchema>;

export function parseAutoRule(raw: unknown): AutoRule | null {
  if (!raw) return null;
  const r = autoRuleSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export interface AutoTask {
  assigneeId: string;
  projectId: string | null;
  title: string;
  /** Dia (fuso do app) em que a tarefa foi criada. */
  createdOn: DayKey;
  dueOn: DayKey | null;
  /** Dia (fuso do app) em que foi concluída; null se aberta. */
  completedOn: DayKey | null;
  fields: Record<string, string | number | null>;
}

export type CrmEventType = "ACCOUNT_CREATED" | "CONTACT" | "STATUS" | "SALE";

export interface AutoCrmEvent {
  type: CrmEventType;
  day: DayKey;
  segment: string;
  userEmail: string | null;
  toStatus: string | null;
  volumeL: number | null;
  amount: number | null;
}

/** Mudança de etapa de um edital (o dia em que foi submetido, aprovado…). */
export interface AutoGrantEvent {
  toStatus: string;
  day: DayKey;
  ownerId: string;
  approvedAmount: number | null;
}

export interface AutoFieldChange {
  assigneeId: string;
  projectId: string | null;
  title: string;
  field: string;
  toValue: string | null;
  on: DayKey;
}

export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

function matches(rule: AutoRule, t: { projectId: string | null; title: string }) {
  if (rule.projectIds.length > 0 && (!t.projectId || !rule.projectIds.includes(t.projectId))) return false;
  if (rule.nameContains && !normalize(t.title).includes(normalize(rule.nameContains))) return false;
  return true;
}

function fieldValue(fields: Record<string, string | number | null>, field: string) {
  const key = Object.keys(fields).find((k) => normalize(k) === normalize(field));
  return key === undefined ? undefined : fields[key];
}

/** Converte "R$ 10.000,50", "10000" ou 10000 em número. */
export function toNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = v.replace(/[^\d,.-]/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Valor do indicador para `userId` no dia `day`.
 * Retorna null quando a regra não pode ser calculada para aquele dia
 * (ex.: soma de campo é uma foto do momento, só existe para hoje).
 */
export function computeAutoValue(params: {
  rule: AutoRule;
  userId: string;
  day: DayKey;
  today: DayKey;
  tasks: AutoTask[];
  changes: AutoFieldChange[];
  crmEvents?: AutoCrmEvent[];
  /** E-mails da pessoa no CRM (login + vínculos), para regras com escopo "person". */
  crmEmails?: string[];
  grantEvents?: AutoGrantEvent[];
}): number | null {
  const { rule, userId, day, today } = params;
  if (isCrmRule(rule.type)) return computeCrmValue(rule, day, params.crmEvents ?? [], params.crmEmails ?? []);
  if (isGrantRule(rule.type)) return computeGrantValue(rule, userId, day, params.grantEvents ?? []);
  const mine = params.tasks.filter((t) => t.assigneeId === userId && matches(rule, t));
  switch (rule.type) {
    case "TASKS_COMPLETED":
      return mine.filter((t) => t.completedOn === day).length;
    case "TASKS_CREATED":
      return mine.filter((t) => t.createdOn === day).length;
    case "TASKS_OVERDUE":
      // Aberta ao final do dia `day` e com prazo anterior a ele
      return mine.filter((t) => t.createdOn <= day && t.dueOn !== null && t.dueOn < day && (t.completedOn === null || t.completedOn > day)).length;
    case "FIELD_SUM": {
      if (day !== today || !rule.field) return null;
      return mine
        .filter((t) => t.completedOn === null)
        .reduce((s, t) => s + (toNumber(fieldValue(t.fields, rule.field!)) ?? 0), 0);
    }
    case "FIELD_CHANGED_TO": {
      if (!rule.field) return null;
      return params.changes.filter(
        (c) =>
          c.assigneeId === userId &&
          c.on === day &&
          matches(rule, c) &&
          normalize(c.field) === normalize(rule.field!) &&
          (!rule.value || (c.toValue !== null && normalize(c.toValue) === normalize(rule.value))),
      ).length;
    }
    default:
      return null;
  }
}

function computeCrmValue(rule: AutoRule, day: DayKey, events: AutoCrmEvent[], emails: string[]): number {
  const mine = new Set(emails.map((e) => e.toLowerCase()));
  const selected = events.filter((e) => {
    if (e.day !== day) return false;
    if (rule.segment) {
      const inSeg = normalize(e.segment).includes(normalize(rule.segment));
      if (rule.segmentMode === "include" ? !inSeg : inSeg) return false;
    }
    if (rule.scope === "person" && !(e.userEmail && mine.has(e.userEmail.toLowerCase()))) return false;
    return true;
  });
  const of = (t: CrmEventType) => selected.filter((e) => e.type === t);
  switch (rule.type) {
    case "CRM_ACCOUNTS_CREATED":
      return of("ACCOUNT_CREATED").length;
    case "CRM_CONTACTS":
      return of("CONTACT").length;
    case "CRM_STATUS_REACHED": {
      const target = normalize(rule.value ?? "");
      if (!target) return 0;
      // "5." casa com "5. Teste em andamento…"; texto casa por trecho ("teste").
      return of("STATUS").filter((e) => {
        const s = normalize(e.toStatus ?? "");
        return /^\d+\.?$/.test(target) ? s.startsWith(target.endsWith(".") ? target : `${target}.`) : s.includes(target);
      }).length;
    }
    case "CRM_LITERS_SOLD":
      return Math.round(of("SALE").reduce((s, e) => s + (e.volumeL ?? 0), 0) * 100) / 100;
    case "CRM_REVENUE":
      return Math.round(of("SALE").reduce((s, e) => s + (e.amount ?? 0), 0) * 100) / 100;
    default:
      return 0;
  }
}

function computeGrantValue(rule: AutoRule, userId: string, day: DayKey, events: AutoGrantEvent[]): number {
  const selected = events.filter((e) => e.day === day && (rule.scope !== "person" || e.ownerId === userId));
  switch (rule.type) {
    case "GRANTS_SUBMITTED":
      return selected.filter((e) => e.toStatus === "SUBMITTED").length;
    case "GRANTS_APPROVED":
      return selected.filter((e) => e.toStatus === "APPROVED").length;
    case "GRANTS_APPROVED_AMOUNT":
      return Math.round(selected.filter((e) => e.toStatus === "APPROVED").reduce((s, e) => s + (e.approvedAmount ?? 0), 0) * 100) / 100;
    default:
      return 0;
  }
}

export function describeAutoRule(rule: AutoRule, projectNames: Map<string, string> = new Map()): string {
  const parts: string[] = [AUTO_RULE_TYPES[rule.type]];
  if (rule.field && !isCrmRule(rule.type)) parts.push(`campo “${rule.field}”${rule.value ? ` = “${rule.value}”` : ""}`);
  if (rule.nameContains) parts.push(`título contém “${rule.nameContains}”`);
  if (isCrmRule(rule.type)) {
    if (rule.type === "CRM_STATUS_REACHED" && rule.value) parts.push(`etapa “${rule.value}”`);
    if (rule.segment) parts.push(`${rule.segmentMode === "exclude" ? "exceto segmento" : "segmento"} “${rule.segment}”`);
    parts.push(rule.scope === "person" ? "só da pessoa" : "toda a equipe comercial");
  }
  if (isGrantRule(rule.type)) parts.push(rule.scope === "person" ? "só editais em que a pessoa é responsável" : "todos os editais");
  if (rule.projectIds.length) parts.push(`projetos: ${rule.projectIds.map((id) => projectNames.get(id) ?? id).join(", ")}`);
  return parts.join(" · ");
}
