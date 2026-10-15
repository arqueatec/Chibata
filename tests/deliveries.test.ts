import { describe, expect, it } from "vitest";
import { canStillContest, countsAsDone, evidenceRate, normalizeEvidenceUrl, notCountingReason } from "@/lib/domain/deliveries";
import { computeAutoValue, type AutoRule, type AutoTask } from "@/lib/domain/autoIndicators";

const base = { status: "DONE", evidenceUrl: null, asanaAttachments: 0, requiresEvidence: false, contestedAt: null };

describe("entregas", () => {
  it("conta concluída sem exigência; exige evidência quando marcada; contestada não conta", () => {
    expect(countsAsDone(base)).toBe(true);
    expect(countsAsDone({ ...base, requiresEvidence: true })).toBe(false);
    expect(notCountingReason({ ...base, requiresEvidence: true })).toBe("falta evidência");
    expect(countsAsDone({ ...base, requiresEvidence: true, asanaAttachments: 2 })).toBe(true);
    expect(countsAsDone({ ...base, requiresEvidence: true, evidenceUrl: "https://drive.google.com/x" })).toBe(true);
    expect(countsAsDone({ ...base, contestedAt: new Date(), evidenceUrl: "https://x.com" })).toBe(false);
    expect(notCountingReason({ ...base, contestedAt: new Date() })).toBe("contestada pelo líder");
    expect(countsAsDone({ ...base, status: "TODO" })).toBe(false);
  });

  it("prazo de contestação: até 2 dias úteis depois da conclusão", () => {
    // 2026-10-08 é quinta-feira
    expect(canStillContest("2026-10-08", "2026-10-08")).toBe(true);
    expect(canStillContest("2026-10-08", "2026-10-12")).toBe(true); // sex + seg
    expect(canStillContest("2026-10-08", "2026-10-13")).toBe(false);
  });

  it("taxa de evidência e validação do link", () => {
    expect(evidenceRate([])).toBeNull();
    expect(evidenceRate([{ evidenceUrl: "https://a", asanaAttachments: 0 }, { evidenceUrl: null, asanaAttachments: 0 }])).toBe(0.5);
    expect(normalizeEvidenceUrl("  https://drive.google.com/a  ")).toBe("https://drive.google.com/a");
    expect(normalizeEvidenceUrl("")).toBeNull();
    expect(() => normalizeEvidenceUrl("javascript:alert(1)")).toThrow();
  });
});

describe("regra de tarefas concluídas por origem", () => {
  const T = (over: Partial<AutoTask>): AutoTask => ({ assigneeId: "u", projectId: null, title: "t", createdOn: "2026-10-01", dueOn: null, completedOn: "2026-10-08", fields: {}, ...over });
  const rule = (taskOrigin: AutoRule["taskOrigin"]): AutoRule => ({ type: "TASKS_COMPLETED", projectIds: [], segmentMode: "include", scope: "all", taskOrigin });
  const tasks = [T({}), T({ unplanned: true }), T({ unplanned: true, counts: false }), T({ counts: false })];
  const run = (o: AutoRule["taskOrigin"]) => computeAutoValue({ rule: rule(o), userId: "u", day: "2026-10-08", today: "2026-10-08", tasks, changes: [] });

  it("separa planejadas e demandas extras e ignora as que não contam", () => {
    expect(run("all")).toBe(2);
    expect(run("planned")).toBe(1);
    expect(run("unplanned")).toBe(1);
  });
});
