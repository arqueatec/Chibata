import { describe, expect, it } from "vitest";
import { missingCheckinStreak, weeklyProgressAlerts } from "@/lib/domain/alerts";
import type { ScoringIndicator } from "@/lib/domain/scoring";

describe("alerta de dias sem check-in", () => {
  it("conta dias úteis consecutivos sem check-in, ignorando fins de semana e o dia de hoje", () => {
    // hoje: quarta 23/09. Último check-in: quinta 17/09 -> faltaram 18(sex), 21(seg), 22(ter) = 3
    expect(missingCheckinStreak(["2026-09-17"], "2026-09-23")).toBe(3);
    expect(missingCheckinStreak(["2026-09-22"], "2026-09-23")).toBe(0);
    // segunda: último check-in sexta -> 0
    expect(missingCheckinStreak(["2026-09-18"], "2026-09-21")).toBe(0);
  });
  it("não conta dias antes do início da pessoa", () => {
    expect(missingCheckinStreak([], "2026-09-23", "2026-09-22")).toBe(1);
  });
});

describe("alerta de meta semanal abaixo de 50% a partir de quinta", () => {
  const ind: ScoringIndicator = {
    id: "c",
    name: "Contatos",
    direction: "HIGHER_BETTER",
    aggregation: "SUM",
    targetValue: 20,
    targetPeriod: "WEEKLY",
    weight: 1,
  };
  it("dispara na quinta quando o acumulado está abaixo da metade", () => {
    const alerts = weeklyProgressAlerts([ind], [{ indicatorId: "c", date: "2026-09-21", value: 5 }], "2026-09-24");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].progress).toBeCloseTo(0.25);
  });
  it("não dispara antes de quinta nem acima de 50%", () => {
    expect(weeklyProgressAlerts([ind], [], "2026-09-23")).toHaveLength(0);
    expect(weeklyProgressAlerts([ind], [{ indicatorId: "c", date: "2026-09-22", value: 11 }], "2026-09-24")).toHaveLength(0);
  });
  it("ignora indicadores do tipo 'menor é melhor'", () => {
    expect(weeklyProgressAlerts([{ ...ind, direction: "LOWER_BETTER" }], [], "2026-09-25")).toHaveLength(0);
  });
});
