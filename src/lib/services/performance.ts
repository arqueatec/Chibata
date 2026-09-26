import "server-only";
import { prisma } from "@/lib/db";
import {
  dateToKey,
  keyToDate,
  previousPeriod,
  type DayKey,
  type Period,
} from "@/lib/domain/dates";
import { computeScore, type ScoreResult, type ScoringEntry, type ScoringIndicator } from "@/lib/domain/scoring";

export interface PerfUser {
  id: string;
  name: string;
  jobTitle: string | null;
  areaId: string | null;
  areaName: string | null;
  indicatorsWeight: number;
  checkinWeight: number;
  createdAt: DayKey;
  indicators: (ScoringIndicator & { unit: string; targetPeriod: ScoringIndicator["targetPeriod"]; sortOrder: number })[];
}

export interface PerfData {
  users: PerfUser[];
  entries: Map<string, ScoringEntry[]>;
  checkIns: Map<string, DayKey[]>;
}

/** Carrega, em lote, tudo o que é preciso para calcular notas de várias pessoas em um intervalo. */
export async function loadPerformanceData(userIds: string[], from: DayKey, to: DayKey): Promise<PerfData> {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    include: {
      area: { include: { indicators: { where: { active: true, ownerId: null } } } },
      personalIndicators: { where: { active: true } },
    },
    orderBy: { name: "asc" },
  });
  const [entries, checkIns] = await Promise.all([
    prisma.indicatorEntry.findMany({
      where: { userId: { in: userIds }, date: { gte: keyToDate(from), lte: keyToDate(to) } },
      select: { userId: true, indicatorId: true, date: true, value: true },
    }),
    prisma.checkIn.findMany({
      where: { userId: { in: userIds }, date: { gte: keyToDate(from), lte: keyToDate(to) } },
      select: { userId: true, date: true },
    }),
  ]);

  const entryMap = new Map<string, ScoringEntry[]>();
  for (const e of entries) {
    const list = entryMap.get(e.userId) ?? [];
    list.push({ indicatorId: e.indicatorId, date: dateToKey(e.date), value: e.value });
    entryMap.set(e.userId, list);
  }
  const ciMap = new Map<string, DayKey[]>();
  for (const c of checkIns) {
    const list = ciMap.get(c.userId) ?? [];
    list.push(dateToKey(c.date));
    ciMap.set(c.userId, list);
  }

  return {
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      jobTitle: u.jobTitle,
      areaId: u.areaId,
      areaName: u.area?.name ?? null,
      indicatorsWeight: u.area?.indicatorsWeight ?? 80,
      checkinWeight: u.area?.checkinWeight ?? 20,
      createdAt: dateToKey(u.createdAt),
      indicators: [...(u.area?.indicators ?? []), ...u.personalIndicators]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          direction: i.direction,
          aggregation: i.aggregation,
          targetValue: i.targetValue,
          targetPeriod: i.targetPeriod,
          weight: i.weight,
          sortOrder: i.sortOrder,
        })),
    })),
    entries: entryMap,
    checkIns: ciMap,
  };
}

/**
 * Nota da pessoa no período. Dias anteriores ao cadastro da pessoa não contam
 * (quem entrou no meio do mês não é penalizado pelos dias anteriores).
 */
export function scoreUser(data: PerfData, userId: string, period: Period, asOf: DayKey): ScoreResult | null {
  const u = data.users.find((x) => x.id === userId);
  if (!u) return null;
  if (period.end < u.createdAt) return null;
  return computeScore({
    indicators: u.indicators,
    entries: data.entries.get(userId) ?? [],
    checkInDates: data.checkIns.get(userId) ?? [],
    periodStart: period.start < u.createdAt ? u.createdAt : period.start,
    periodEnd: period.end,
    asOf,
    indicatorsWeight: u.indicatorsWeight,
    checkinWeight: u.checkinWeight,
  });
}

/** Sequência de N períodos terminando no período informado (mais antigo primeiro). */
export function periodSeries(last: Period, count: number): Period[] {
  const out: Period[] = [last];
  while (out.length < count) out.unshift(previousPeriod(out[0]));
  return out;
}
