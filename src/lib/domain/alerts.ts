import {
  addDays,
  businessDaysInRange,
  endOfWeek,
  isBusinessDay,
  startOfWeek,
  weekday,
  type DayKey,
} from "./dates";
import { computeScore, type ScoringEntry, type ScoringIndicator } from "./scoring";

export const MISSING_CHECKIN_ALERT_DAYS = 3;
export const WEEKLY_PROGRESS_ALERT_THRESHOLD = 0.5;
/** A partir de quinta-feira (4) a meta semanal abaixo do limiar gera alerta. */
export const WEEKLY_ALERT_FROM_WEEKDAY = 4;

/**
 * Quantos dias úteis consecutivos, contando para trás a partir de ontem, a pessoa está sem check-in.
 * O dia de hoje não conta (a pessoa ainda pode registrar).
 */
export function missingCheckinStreak(checkInDates: Iterable<DayKey>, today: DayKey, since?: DayKey, maxLookback = 60): number {
  const set = new Set(checkInDates);
  let streak = 0;
  let day = addDays(today, -1);
  for (let i = 0; i < maxLookback; i++, day = addDays(day, -1)) {
    if (since && day < since) break;
    if (!isBusinessDay(day)) continue;
    if (set.has(day)) break;
    streak++;
  }
  return streak;
}

export interface WeeklyProgressAlert {
  indicatorId: string;
  indicatorName: string;
  actual: number;
  weekTarget: number;
  progress: number; // 0-1
}

/**
 * Indicadores (maior é melhor) cujo acumulado da semana está abaixo de 50% da meta da semana inteira,
 * avaliado a partir de quinta-feira.
 */
export function weeklyProgressAlerts(indicators: ScoringIndicator[], entries: ScoringEntry[], today: DayKey): WeeklyProgressAlert[] {
  const wd = weekday(today);
  if (wd < WEEKLY_ALERT_FROM_WEEKDAY || wd === 0 || wd === 6) return [];
  const start = startOfWeek(today);
  const end = endOfWeek(today);
  const res = computeScore({
    indicators: indicators.filter((i) => i.direction === "HIGHER_BETTER" && i.aggregation === "SUM" && i.weight > 0),
    entries: entries.filter((e) => e.date <= today),
    checkInDates: [],
    periodStart: start,
    periodEnd: end,
    asOf: end, // meta da semana completa
    indicatorsWeight: 100,
    checkinWeight: 0,
  });
  return res.indicators
    .filter((r) => r.target > 0 && r.actual / r.target < WEEKLY_PROGRESS_ALERT_THRESHOLD)
    .map((r) => ({
      indicatorId: r.id,
      indicatorName: r.name,
      actual: r.actual,
      weekTarget: r.target,
      progress: r.actual / r.target,
    }));
}

export function businessDaysSoFarThisWeek(today: DayKey): number {
  return businessDaysInRange(startOfWeek(today), today).length;
}
