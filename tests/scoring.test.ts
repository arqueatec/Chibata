import { describe, expect, it } from "vitest";
import { attainmentOf, computeScore, periodTarget, scoreDelta, type ScoringIndicator } from "@/lib/domain/scoring";
import { businessDaysInRange } from "@/lib/domain/dates";

const ind = (over: Partial<ScoringIndicator> = {}): ScoringIndicator => ({
  id: "i1",
  name: "Contatos",
  direction: "HIGHER_BETTER",
  aggregation: "SUM",
  targetValue: 10,
  targetPeriod: "WEEKLY",
  weight: 1,
  ...over,
});

// Semana de segunda 21/09/2026 a domingo 27/09/2026
const WEEK = { periodStart: "2026-09-21", periodEnd: "2026-09-27" };
const WEEKDAYS = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"];

describe("periodTarget", () => {
  it("proporcionaliza meta diária, semanal e mensal por dia útil", () => {
    expect(periodTarget(ind({ targetPeriod: "DAILY", targetValue: 3 }), WEEKDAYS)).toBe(15);
    expect(periodTarget(ind({ targetPeriod: "WEEKLY", targetValue: 10 }), WEEKDAYS)).toBeCloseTo(10);
    const sept = businessDaysInRange("2026-09-01", "2026-09-30");
    expect(sept).toHaveLength(22);
    expect(periodTarget(ind({ targetPeriod: "MONTHLY", targetValue: 44 }), sept)).toBeCloseTo(44);
    expect(periodTarget(ind({ targetPeriod: "MONTHLY", targetValue: 44 }), WEEKDAYS)).toBeCloseTo(10);
  });

  it("não proporcionaliza indicadores de estoque (LAST)", () => {
    expect(periodTarget(ind({ aggregation: "LAST", targetValue: 500000 }), WEEKDAYS)).toBe(500000);
  });
});

describe("attainmentOf", () => {
  it("maior é melhor", () => {
    expect(attainmentOf("HIGHER_BETTER", 5, 10)).toBe(0.5);
    expect(attainmentOf("HIGHER_BETTER", 15, 10)).toBe(1.5);
    expect(attainmentOf("HIGHER_BETTER", 3, 0)).toBe(1);
  });
  it("menor é melhor trata a meta como máximo aceitável", () => {
    expect(attainmentOf("LOWER_BETTER", 1, 2)).toBe(1);
    expect(attainmentOf("LOWER_BETTER", 3, 2)).toBe(0.5);
    expect(attainmentOf("LOWER_BETTER", 10, 2)).toBe(0);
    expect(attainmentOf("LOWER_BETTER", 0, 0)).toBe(1);
    expect(attainmentOf("LOWER_BETTER", 1, 0)).toBe(0);
  });
});

describe("computeScore", () => {
  it("combina indicadores e regularidade de check-in com pesos e mostra contribuições", () => {
    const r = computeScore({
      ...WEEK,
      asOf: "2026-09-27",
      indicators: [ind({ id: "a", weight: 3 }), ind({ id: "b", name: "Reuniões", targetValue: 4, weight: 1 })],
      entries: [
        { indicatorId: "a", date: "2026-09-21", value: 5 }, // 5/10 = 50%
        { indicatorId: "b", date: "2026-09-22", value: 2 },
        { indicatorId: "b", date: "2026-09-23", value: 4 }, // 6/4 = 150% -> limitado a 100%
      ],
      checkInDates: ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"], // 4 de 5
      indicatorsWeight: 80,
      checkinWeight: 20,
    });
    // indicadores: 0.75*0.5 + 0.25*1 = 0.625 -> 62.5%
    expect(r.goalAttainment).toBe(62.5);
    expect(r.checkinRate).toBe(80);
    // 0.625*80 + 0.8*20 = 50 + 16 = 66
    expect(r.score).toBe(66);
    const a = r.indicators.find((i) => i.id === "a")!;
    const b = r.indicators.find((i) => i.id === "b")!;
    expect(a.contribution).toBe(30);
    expect(b.contribution).toBe(20);
    expect(b.rawAttainment).toBe(1.5);
    expect(b.attainment).toBe(1);
    expect(r.checkinContribution).toBe(16);
    // soma das contribuições = nota (transparência)
    expect(a.contribution + b.contribution + r.checkinContribution).toBeCloseTo(r.score!);
    expect(a.explanation).toContain("pts");
  });

  it("em período em andamento considera só os dias úteis até a data de referência", () => {
    const r = computeScore({
      ...WEEK,
      asOf: "2026-09-22", // terça: 2 dias úteis
      indicators: [ind({ targetValue: 10 })],
      entries: [
        { indicatorId: "i1", date: "2026-09-21", value: 4 },
        { indicatorId: "i1", date: "2026-09-25", value: 100 }, // depois da referência: ignorado
      ],
      checkInDates: ["2026-09-21", "2026-09-22"],
      indicatorsWeight: 80,
      checkinWeight: 20,
    });
    expect(r.countedBusinessDays).toBe(2);
    expect(r.indicators[0].target).toBe(4);
    expect(r.indicators[0].actual).toBe(4);
    expect(r.score).toBe(100);
  });

  it("check-ins de fim de semana não aumentam nem reduzem a regularidade", () => {
    const r = computeScore({
      ...WEEK,
      asOf: "2026-09-27",
      indicators: [],
      entries: [],
      checkInDates: [...WEEKDAYS, "2026-09-26"],
      indicatorsWeight: 80,
      checkinWeight: 20,
    });
    expect(r.checkinsDone).toBe(5);
    expect(r.checkinRate).toBe(100);
  });

  it("sem indicadores, a nota é baseada apenas na regularidade", () => {
    const r = computeScore({
      ...WEEK,
      asOf: "2026-09-27",
      indicators: [],
      entries: [],
      checkInDates: ["2026-09-21"],
      indicatorsWeight: 80,
      checkinWeight: 20,
    });
    expect(r.effectiveCheckinWeight).toBe(100);
    expect(r.score).toBe(20);
    expect(r.goalAttainment).toBeNull();
  });

  it("indicador de estoque usa o último valor lançado", () => {
    const r = computeScore({
      ...WEEK,
      asOf: "2026-09-27",
      indicators: [ind({ aggregation: "LAST", targetValue: 100 })],
      entries: [
        { indicatorId: "i1", date: "2026-09-21", value: 200 },
        { indicatorId: "i1", date: "2026-09-24", value: 50 },
      ],
      checkInDates: [],
      indicatorsWeight: 100,
      checkinWeight: 0,
    });
    expect(r.indicators[0].actual).toBe(50);
    expect(r.score).toBe(50);
  });

  it("período futuro não tem nota", () => {
    const r = computeScore({
      ...WEEK,
      asOf: "2026-09-20",
      indicators: [ind()],
      entries: [],
      checkInDates: [],
      indicatorsWeight: 80,
      checkinWeight: 20,
    });
    expect(r.score).toBeNull();
  });

  it("indicador com peso zero aparece mas não contribui", () => {
    const r = computeScore({
      ...WEEK,
      asOf: "2026-09-27",
      indicators: [ind({ id: "a" }), ind({ id: "z", weight: 0 })],
      entries: [{ indicatorId: "a", date: "2026-09-21", value: 10 }],
      checkInDates: WEEKDAYS,
      indicatorsWeight: 80,
      checkinWeight: 20,
    });
    expect(r.score).toBe(100);
    expect(r.indicators.find((i) => i.id === "z")!.contribution).toBe(0);
  });

  it("indicador 'menor é melhor' de último valor sem lançamento não conta como meta cumprida", () => {
    // Caso real: "Tempo médio de produção por lote" (máximo 4 h) sem nenhum valor informado
    const r = computeScore({
      ...WEEK,
      asOf: "2026-09-27",
      indicators: [
        ind({ id: "litros", targetValue: 100, weight: 3 }),
        ind({ id: "tempo", direction: "LOWER_BETTER", aggregation: "LAST", targetValue: 4, targetPeriod: "MONTHLY", weight: 2 }),
      ],
      entries: [],
      checkInDates: [],
      indicatorsWeight: 80,
      checkinWeight: 20,
    });
    const tempo = r.indicators.find((i) => i.id === "tempo")!;
    expect(tempo.noData).toBe(true);
    expect(tempo.attainment).toBe(0);
    expect(tempo.contribution).toBe(0);
    expect(tempo.explanation).toContain("sem lançamento");
    expect(r.score).toBe(0);
  });

  it("'menor é melhor' de último valor com lançamento abaixo do máximo vale 100%", () => {
    const r = computeScore({
      ...WEEK,
      asOf: "2026-09-27",
      indicators: [ind({ id: "tempo", direction: "LOWER_BETTER", aggregation: "LAST", targetValue: 4, weight: 1 })],
      entries: [{ indicatorId: "tempo", date: "2026-09-22", value: 3.5 }],
      checkInDates: [],
      indicatorsWeight: 100,
      checkinWeight: 0,
    });
    expect(r.indicators[0].noData).toBe(false);
    expect(r.score).toBe(100);
  });

  it("'menor é melhor' de soma (ex.: não conformidades) em branco vale zero ocorrências só se houve check-in", () => {
    const base = {
      ...WEEK,
      asOf: "2026-09-27",
      indicators: [ind({ id: "nc", direction: "LOWER_BETTER", targetValue: 2, targetPeriod: "MONTHLY" as const, weight: 1 })],
      entries: [],
      indicatorsWeight: 100,
      checkinWeight: 0,
    };
    expect(computeScore({ ...base, checkInDates: ["2026-09-21"] }).score).toBe(100);
    const none = computeScore({ ...base, checkInDates: [] });
    expect(none.indicators[0].noData).toBe(true);
    expect(none.score).toBe(0);
  });

  it("calcula variação em relação ao período anterior", () => {
    expect(scoreDelta(70, 62.5)).toBe(7.5);
    expect(scoreDelta(null, 50)).toBeNull();
  });
});
