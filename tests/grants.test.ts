import { describe, expect, it } from "vitest";
import { computeAutoValue, type AutoGrantEvent } from "@/lib/domain/autoIndicators";
import { grantAlerts, grantStats, type GrantForAlerts } from "@/lib/domain/grants";

const today = "2026-10-08";

describe("grantAlerts", () => {
  const base: GrantForAlerts = { id: "g1", title: "Centelha", status: "PREPARING", submissionDeadline: null, items: [] };

  it("alerta submissão próxima (médio) e urgente/vencida (alto)", () => {
    expect(grantAlerts([{ ...base, submissionDeadline: "2026-10-14" }], today)).toMatchObject([{ severity: "medium" }]);
    expect(grantAlerts([{ ...base, submissionDeadline: "2026-10-10" }], today)).toMatchObject([{ severity: "high" }]);
    expect(grantAlerts([{ ...base, submissionDeadline: "2026-10-01" }], today)[0].text).toContain("venceu há 7 dia(s)");
  });

  it("ignora prazo distante e editais já submetidos", () => {
    expect(grantAlerts([{ ...base, submissionDeadline: "2026-10-30" }], today)).toEqual([]);
    expect(grantAlerts([{ ...base, status: "SUBMITTED", submissionDeadline: "2026-10-09" }], today)).toEqual([]);
  });

  it("alerta itens abertos de projetos aprovados; ignora concluídos e editais não aprovados", () => {
    const items = [
      { title: "Relatório parcial", kind: "REPORT" as const, dueDate: "2026-10-05", done: false },
      { title: "Protótipo", kind: "DELIVERABLE" as const, dueDate: "2026-10-12", done: false },
      { title: "1ª parcela", kind: "INSTALLMENT" as const, dueDate: "2026-10-06", done: true },
    ];
    const res = grantAlerts([{ ...base, status: "EXECUTING", items }], today);
    expect(res.map((a) => a.severity)).toEqual(["high", "medium"]);
    expect(grantAlerts([{ ...base, status: "PREPARING", items }], today)).toEqual([]);
  });
});

describe("grantStats", () => {
  it("conta submissões, aprovações e taxa no período", () => {
    const s = grantStats(
      [
        { status: "EXECUTING", requestedAmount: 100, approvedAmount: 80, changes: [{ toStatus: "SUBMITTED", day: "2026-03-01" }, { toStatus: "APPROVED", day: "2026-05-01" }, { toStatus: "EXECUTING", day: "2026-06-01" }] },
        { status: "REJECTED", requestedAmount: 50, approvedAmount: null, changes: [{ toStatus: "SUBMITTED", day: "2026-04-01" }, { toStatus: "REJECTED", day: "2026-06-01" }] },
        { status: "SUBMITTED", requestedAmount: 70, approvedAmount: null, changes: [{ toStatus: "SUBMITTED", day: "2025-12-01" }] },
        { status: "PREPARING", requestedAmount: 30, approvedAmount: null, changes: [] },
      ],
      "2026-01-01",
      "2026-12-31",
    );
    expect(s).toMatchObject({ submitted: 2, approved: 1, rejected: 1, approvedAmount: 80, approvalRate: 0.5, pending: 1, pendingAmount: 70, inPreparation: 1, active: 1 });
  });

  it("sem resultados no período a taxa é null", () => {
    expect(grantStats([], "2026-01-01", "2026-12-31").approvalRate).toBeNull();
  });
});

describe("indicadores automáticos de editais", () => {
  const events: AutoGrantEvent[] = [
    { toStatus: "SUBMITTED", day: today, ownerId: "u1", approvedAmount: null },
    { toStatus: "SUBMITTED", day: today, ownerId: "u2", approvedAmount: null },
    { toStatus: "APPROVED", day: today, ownerId: "u1", approvedAmount: 150000 },
    { toStatus: "APPROVED", day: "2026-10-07", ownerId: "u1", approvedAmount: 50000 },
  ];
  const run = (type: "GRANTS_SUBMITTED" | "GRANTS_APPROVED" | "GRANTS_APPROVED_AMOUNT", scope: "all" | "person") =>
    computeAutoValue({ rule: { type, scope, projectIds: [], segmentMode: "include" }, userId: "u1", day: today, today, tasks: [], changes: [], grantEvents: events });

  it("conta toda a equipe ou só os editais da pessoa", () => {
    expect(run("GRANTS_SUBMITTED", "all")).toBe(2);
    expect(run("GRANTS_SUBMITTED", "person")).toBe(1);
    expect(run("GRANTS_APPROVED", "all")).toBe(1);
    expect(run("GRANTS_APPROVED_AMOUNT", "person")).toBe(150000);
  });
});
