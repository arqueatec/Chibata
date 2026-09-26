/**
 * Utilitários de data baseados em "chaves de dia" no formato YYYY-MM-DD.
 * Datas de calendário (check-ins, prazos) são armazenadas como DATE e manipuladas
 * em UTC para evitar deslocamentos de fuso. "Hoje" é calculado no fuso do app.
 */

export type DayKey = string; // YYYY-MM-DD

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: string): value is DayKey {
  if (!KEY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function todayKey(now: Date = new Date(), timeZone = process.env.APP_TIMEZONE || "America/Sao_Paulo"): DayKey {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function keyToDate(key: DayKey): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function dateToKey(date: Date): DayKey {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: DayKey, n: number): DayKey {
  const d = keyToDate(key);
  d.setUTCDate(d.getUTCDate() + n);
  return dateToKey(d);
}

/** 0 = domingo ... 6 = sábado */
export function weekday(key: DayKey): number {
  return keyToDate(key).getUTCDay();
}

export function isBusinessDay(key: DayKey): boolean {
  const w = weekday(key);
  return w !== 0 && w !== 6;
}

export function compareKeys(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minKey(a: DayKey, b: DayKey): DayKey {
  return a <= b ? a : b;
}

export function maxKey(a: DayKey, b: DayKey): DayKey {
  return a >= b ? a : b;
}

/** Lista de dias de start a end (inclusive). */
export function eachDay(start: DayKey, end: DayKey): DayKey[] {
  const out: DayKey[] = [];
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k);
  return out;
}

export function businessDaysInRange(start: DayKey, end: DayKey): DayKey[] {
  if (start > end) return [];
  return eachDay(start, end).filter(isBusinessDay);
}

/**
 * Número de dias úteis decorridos DEPOIS de `from` até `to` (inclusive).
 * Ex.: de sexta para segunda = 1; de quinta para segunda = 2.
 */
export function businessDaysAfter(from: DayKey, to: DayKey): number {
  if (to <= from) return 0;
  return businessDaysInRange(addDays(from, 1), to).length;
}

export function startOfWeek(key: DayKey): DayKey {
  const w = weekday(key);
  const diff = w === 0 ? -6 : 1 - w; // semana começa na segunda
  return addDays(key, diff);
}

export function endOfWeek(key: DayKey): DayKey {
  return addDays(startOfWeek(key), 6);
}

export function startOfMonth(key: DayKey): DayKey {
  return `${key.slice(0, 7)}-01`;
}

export function endOfMonth(key: DayKey): DayKey {
  const d = keyToDate(startOfMonth(key));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return dateToKey(d);
}

export function addMonths(key: DayKey, n: number): DayKey {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return dateToKey(d);
}

export type PeriodKind = "week" | "month";

export interface Period {
  kind: PeriodKind;
  start: DayKey;
  end: DayKey;
}

export function periodContaining(kind: PeriodKind, key: DayKey): Period {
  return kind === "week"
    ? { kind, start: startOfWeek(key), end: endOfWeek(key) }
    : { kind, start: startOfMonth(key), end: endOfMonth(key) };
}

export function previousPeriod(p: Period): Period {
  return p.kind === "week"
    ? periodContaining("week", addDays(p.start, -7))
    : periodContaining("month", addMonths(p.start, -1));
}

export function nextPeriod(p: Period): Period {
  return p.kind === "week"
    ? periodContaining("week", addDays(p.start, 7))
    : periodContaining("month", addMonths(p.start, 1));
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function formatDay(key: DayKey, withWeekday = false): string {
  const [y, m, d] = key.split("-");
  const base = `${d}/${m}/${y}`;
  return withWeekday ? `${WEEKDAYS[weekday(key)]}, ${base}` : base;
}

export function formatShortDay(key: DayKey): string {
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

export function weekdayName(key: DayKey): string {
  return WEEKDAYS[weekday(key)];
}

export function formatPeriodTitle(p: Period): string {
  const s = formatPeriod(p);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatPeriod(p: Period): string {
  if (p.kind === "month") {
    const [y, m] = p.start.split("-").map(Number);
    return `${MONTHS[m - 1]} de ${y}`;
  }
  return `semana de ${formatShortDay(p.start)} a ${formatShortDay(p.end)}`;
}
