export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  COORDINATOR: "Coordenador(a)",
  COLLABORATOR: "Colaborador(a)",
};

export const STATUS_LABEL: Record<string, string> = {
  TODO: "A fazer",
  IN_PROGRESS: "Em andamento",
  BLOCKED: "Bloqueada",
  DONE: "Concluída",
};

export const PERIOD_LABEL: Record<string, string> = { DAILY: "diária", WEEKLY: "semanal", MONTHLY: "mensal" };
export const UNIT_LABEL: Record<string, string> = { COUNT: "quantidade", CURRENCY: "R$", PERCENT: "%", HOURS: "horas" };
export const ACTION_LABEL: Record<string, string> = {
  CREATE: "Criação",
  UPDATE: "Edição",
  DELETE: "Exclusão",
  FINALIZE: "Finalização",
  REOPEN: "Reabertura",
  RESOLVE: "Resolução",
  EXPORT: "Exportação",
  LOGIN: "Acesso",
};
export const ENTITY_LABEL: Record<string, string> = {
  CheckIn: "Check-in",
  IndicatorEntry: "Lançamento de indicador",
  Indicator: "Indicador",
  MonthlyReview: "Revisão mensal",
  Task: "Tarefa/meta",
  Feedback: "Feedback",
  User: "Pessoa",
  Area: "Área",
  Project: "Projeto/cliente",
  Export: "Exportação de dados",
};

const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const cf = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function formatNumber(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : nf.format(n);
}

export function formatValue(n: number | null | undefined, unit?: string | null) {
  if (n === null || n === undefined) return "—";
  if (unit === "CURRENCY") return cf.format(n);
  if (unit === "PERCENT") return `${nf.format(n)}%`;
  if (unit === "HOURS") return `${nf.format(n)} h`;
  return nf.format(n);
}

export function formatScore(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : nf.format(Math.round(n * 10) / 10);
}

export function formatDateTime(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: process.env.APP_TIMEZONE || "America/Sao_Paulo",
  }).format(d);
}

export function scoreTone(n: number | null | undefined): "good" | "warn" | "bad" | "none" {
  if (n === null || n === undefined) return "none";
  if (n >= 75) return "good";
  if (n >= 50) return "warn";
  return "bad";
}
