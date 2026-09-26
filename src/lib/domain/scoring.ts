/**
 * Cálculo transparente da nota de desempenho por período.
 *
 * Nota = (pesoIndicadores × componenteIndicadores + pesoCheckin × componenteCheckin) / (pesoIndicadores + pesoCheckin)
 *
 * - componenteIndicadores: média ponderada (pelos pesos de cada indicador) do atingimento de cada meta,
 *   limitado a 100% por indicador para que um indicador não compense outro indefinidamente.
 * - componenteCheckin: check-ins feitos em dias úteis ÷ dias úteis considerados no período.
 * - A meta do período é proporcional: meta diária × dias úteis, semanal ÷ 5 por dia útil,
 *   mensal ÷ dias úteis do mês por dia útil. Indicadores de "estoque" (agregação LAST, ex.: pipeline)
 *   comparam o último valor lançado com a meta, sem proporcionalizar.
 * - Em períodos em andamento, só contam os dias úteis até a data de referência (asOf).
 */
import { businessDaysInRange, endOfMonth, minKey, startOfMonth, type DayKey } from "./dates";

export type TargetPeriodName = "DAILY" | "WEEKLY" | "MONTHLY";
export type DirectionName = "HIGHER_BETTER" | "LOWER_BETTER";
export type AggregationName = "SUM" | "LAST";

export interface ScoringIndicator {
  id: string;
  name: string;
  unit?: string;
  direction: DirectionName;
  aggregation: AggregationName;
  targetValue: number;
  targetPeriod: TargetPeriodName;
  weight: number;
}

export interface ScoringEntry {
  indicatorId: string;
  date: DayKey;
  value: number;
}

export interface ScoringInput {
  indicators: ScoringIndicator[];
  entries: ScoringEntry[];
  checkInDates: DayKey[];
  periodStart: DayKey;
  periodEnd: DayKey;
  /** Data de referência (normalmente hoje). Dias após ela não entram na meta. */
  asOf: DayKey;
  indicatorsWeight: number;
  checkinWeight: number;
}

export interface IndicatorResult {
  id: string;
  name: string;
  unit?: string;
  direction: DirectionName;
  aggregation: AggregationName;
  actual: number;
  target: number;
  /** Atingimento bruto (pode passar de 100%). */
  rawAttainment: number;
  /** Atingimento usado na nota (0 a 1). */
  attainment: number;
  weight: number;
  /** Peso relativo dentro dos indicadores (0 a 1). */
  normalizedWeight: number;
  /** Pontos que este indicador somou à nota final (0-100). */
  contribution: number;
  explanation: string;
}

export interface ScoreResult {
  /** Nota final 0-100, ou null se o período ainda não tem dias úteis a considerar. */
  score: number | null;
  /** Percentual de meta atingida (0-100) — base para comparar pessoas de áreas diferentes. */
  goalAttainment: number | null;
  checkinRate: number | null;
  countedBusinessDays: number;
  checkinsDone: number;
  effectiveIndicatorsWeight: number;
  effectiveCheckinWeight: number;
  indicators: IndicatorResult[];
  checkinContribution: number;
}

export const MAX_ATTAINMENT_FOR_SCORE = 1;

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** Meta de um indicador para o conjunto de dias úteis considerados. */
export function periodTarget(indicator: ScoringIndicator, countedDays: DayKey[]): number {
  if (indicator.aggregation === "LAST") return indicator.targetValue;
  let total = 0;
  const monthDaysCache = new Map<string, number>();
  for (const day of countedDays) {
    switch (indicator.targetPeriod) {
      case "DAILY":
        total += indicator.targetValue;
        break;
      case "WEEKLY":
        total += indicator.targetValue / 5;
        break;
      case "MONTHLY": {
        const m = day.slice(0, 7);
        let n = monthDaysCache.get(m);
        if (n === undefined) {
          n = businessDaysInRange(startOfMonth(day), endOfMonth(day)).length;
          monthDaysCache.set(m, n);
        }
        total += indicator.targetValue / n;
        break;
      }
    }
  }
  return total;
}

export function aggregate(indicator: ScoringIndicator, entries: ScoringEntry[]): number {
  const own = entries.filter((e) => e.indicatorId === indicator.id);
  if (own.length === 0) return 0;
  if (indicator.aggregation === "LAST") {
    return own.reduce((a, b) => (b.date >= a.date ? b : a)).value;
  }
  return own.reduce((s, e) => s + e.value, 0);
}

export function attainmentOf(direction: DirectionName, actual: number, target: number): number {
  if (direction === "HIGHER_BETTER") {
    if (target <= 0) return 1; // sem meta: não penaliza
    return Math.max(0, actual / target);
  }
  // Menor é melhor (ex.: não conformidades, tarefas atrasadas): meta é o máximo aceitável.
  if (actual <= target) return 1;
  return Math.max(0, 1 - (actual - target) / Math.max(target, 1));
}

export function computeScore(input: ScoringInput): ScoreResult {
  const lastDay = minKey(input.periodEnd, input.asOf);
  const countedDays = businessDaysInRange(input.periodStart, lastDay);
  const inPeriod = (d: DayKey) => d >= input.periodStart && d <= lastDay;
  const entries = input.entries.filter((e) => inPeriod(e.date));
  const countedSet = new Set(countedDays);
  const checkinsDone = new Set(input.checkInDates.filter((d) => countedSet.has(d))).size;

  const active = input.indicators.filter((i) => i.weight > 0);
  const weightSum = active.reduce((s, i) => s + i.weight, 0);

  let iw = Math.max(0, input.indicatorsWeight);
  let cw = Math.max(0, input.checkinWeight);
  if (active.length === 0) {
    cw = iw + cw || 1;
    iw = 0;
  }
  if (iw + cw === 0) {
    iw = 1;
  }
  const iShare = iw / (iw + cw);
  const cShare = cw / (iw + cw);

  if (countedDays.length === 0) {
    return {
      score: null,
      goalAttainment: null,
      checkinRate: null,
      countedBusinessDays: 0,
      checkinsDone: 0,
      effectiveIndicatorsWeight: round(iShare * 100),
      effectiveCheckinWeight: round(cShare * 100),
      indicators: [],
      checkinContribution: 0,
    };
  }

  let goalSum = 0;
  const indicators: IndicatorResult[] = input.indicators.map((ind) => {
    const actual = aggregate(ind, entries);
    const target = periodTarget(ind, countedDays);
    const raw = attainmentOf(ind.direction, actual, target);
    const att = Math.min(MAX_ATTAINMENT_FOR_SCORE, raw);
    const nw = ind.weight > 0 && weightSum > 0 ? ind.weight / weightSum : 0;
    goalSum += att * nw;
    const contribution = att * nw * iShare * 100;
    const dir = ind.direction === "HIGHER_BETTER" ? "meta" : "máximo aceitável";
    const explanation =
      `${round(actual, 2)} de ${round(target, 2)} (${dir}) → ${round(raw * 100)}% ` +
      `(usado ${round(att * 100)}%) × peso ${round(nw * 100)}% dos indicadores × ${round(iShare * 100)}% = ${round(contribution)} pts`;
    return {
      id: ind.id,
      name: ind.name,
      unit: ind.unit,
      direction: ind.direction,
      aggregation: ind.aggregation,
      actual: round(actual, 2),
      target: round(target, 2),
      rawAttainment: round(raw, 4),
      attainment: round(att, 4),
      weight: ind.weight,
      normalizedWeight: round(nw, 4),
      contribution: round(contribution, 2),
      explanation,
    };
  });
  const goalRaw = active.length ? goalSum : null;

  const checkinRate = checkinsDone / countedDays.length;
  const checkinContribution = checkinRate * cShare * 100;
  const score = (goalRaw ?? 0) * iShare * 100 + checkinContribution;

  return {
    score: round(score),
    goalAttainment: goalRaw === null ? null : round(goalRaw * 100),
    checkinRate: round(checkinRate * 100),
    countedBusinessDays: countedDays.length,
    checkinsDone,
    effectiveIndicatorsWeight: round(iShare * 100),
    effectiveCheckinWeight: round(cShare * 100),
    indicators,
    checkinContribution: round(checkinContribution, 2),
  };
}

/** Diferença entre notas (null se alguma não existir). */
export function scoreDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return round(current - previous);
}
