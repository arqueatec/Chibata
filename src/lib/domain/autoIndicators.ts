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
} as const;

export type AutoRuleType = keyof typeof AUTO_RULE_TYPES;

export const autoRuleSchema = z.object({
  type: z.enum(Object.keys(AUTO_RULE_TYPES) as [AutoRuleType, ...AutoRuleType[]]),
  /** Projetos (IDs do app) considerados; vazio = todos. */
  projectIds: z.array(z.string()).default([]),
  /** Só tarefas cujo título contém este texto (sem diferenciar maiúsculas/acentos). */
  nameContains: z.string().trim().max(120).optional(),
  /** Campo personalizado do Asana (FIELD_SUM e FIELD_CHANGED_TO). */
  field: z.string().trim().max(120).optional(),
  /** Valor-alvo do campo (FIELD_CHANGED_TO). */
  value: z.string().trim().max(120).optional(),
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
}): number | null {
  const { rule, userId, day, today } = params;
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
  }
}

export function describeAutoRule(rule: AutoRule, projectNames: Map<string, string> = new Map()): string {
  const parts: string[] = [AUTO_RULE_TYPES[rule.type]];
  if (rule.field) parts.push(`campo “${rule.field}”${rule.value ? ` = “${rule.value}”` : ""}`);
  if (rule.nameContains) parts.push(`título contém “${rule.nameContains}”`);
  if (rule.projectIds.length) parts.push(`projetos: ${rule.projectIds.map((id) => projectNames.get(id) ?? id).join(", ")}`);
  return parts.join(" · ");
}
