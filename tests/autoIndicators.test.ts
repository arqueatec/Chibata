import { describe, expect, it } from "vitest";
import { computeAutoValue, parseAutoRule, toNumber, type AutoFieldChange, type AutoRule, type AutoTask } from "@/lib/domain/autoIndicators";

const T = (over: Partial<AutoTask>): AutoTask => ({
  assigneeId: "natan",
  projectId: "p1",
  title: "Tarefa",
  createdOn: "2026-09-01",
  dueOn: null,
  completedOn: null,
  fields: {},
  ...over,
});
const rule = (r: Partial<AutoRule> & Pick<AutoRule, "type">): AutoRule => ({ projectIds: [], ...r });
const run = (r: AutoRule, tasks: AutoTask[], day = "2026-10-06", changes: AutoFieldChange[] = []) =>
  computeAutoValue({ rule: r, userId: "natan", day, today: "2026-10-07", tasks, changes });

describe("indicadores automáticos a partir das tarefas", () => {
  it("conta tarefas concluídas no dia, só do responsável", () => {
    const tasks = [T({ completedOn: "2026-10-06" }), T({ completedOn: "2026-10-06" }), T({ completedOn: "2026-10-05" }), T({ assigneeId: "ilaria", completedOn: "2026-10-06" })];
    expect(run(rule({ type: "TASKS_COMPLETED" }), tasks)).toBe(2);
  });

  it("filtra por projeto e por texto no título (sem acentos/maiúsculas)", () => {
    const tasks = [
      T({ title: "Ata da reunião semanal", completedOn: "2026-10-06" }),
      T({ title: "ATA — reunião", completedOn: "2026-10-06", projectId: "p2" }),
      T({ title: "Enviar convites", completedOn: "2026-10-06" }),
    ];
    expect(run(rule({ type: "TASKS_COMPLETED", nameContains: "ata" }), tasks)).toBe(2);
    expect(run(rule({ type: "TASKS_COMPLETED", nameContains: "ata", projectIds: ["p1"] }), tasks)).toBe(1);
  });

  it("tarefas atrasadas: abertas no fim do dia com prazo anterior, inclusive no passado", () => {
    const tasks = [
      T({ dueOn: "2026-10-01" }), // aberta e atrasada
      T({ dueOn: "2026-10-01", completedOn: "2026-10-03" }), // concluída antes do dia avaliado
      T({ dueOn: "2026-10-01", completedOn: "2026-10-08" }), // concluída depois: estava atrasada no dia 06
      T({ dueOn: "2026-10-06" }), // vence no próprio dia: ainda não atrasada
      T({ dueOn: "2026-09-20", createdOn: "2026-10-07" }), // criada depois do dia
    ];
    expect(run(rule({ type: "TASKS_OVERDUE" }), tasks)).toBe(2);
  });

  it("tarefas criadas no dia", () => {
    expect(run(rule({ type: "TASKS_CREATED" }), [T({ createdOn: "2026-10-06" }), T({ createdOn: "2026-10-05" })])).toBe(1);
  });

  it("soma de campo numérico (ex.: Valor estimado) só para hoje e só em tarefas abertas", () => {
    const tasks = [T({ fields: { "Valor estimado": "10000" } }), T({ fields: { "valor ESTIMADO": 5000.5 } }), T({ fields: { "Valor estimado": "99" }, completedOn: "2026-10-01" })];
    const r = rule({ type: "FIELD_SUM", field: "Valor estimado" });
    expect(computeAutoValue({ rule: r, userId: "natan", day: "2026-10-07", today: "2026-10-07", tasks, changes: [] })).toBe(15000.5);
    expect(run(r, tasks, "2026-10-06")).toBeNull(); // dia passado não é calculável
  });

  it("vezes que um campo mudou para um valor (ex.: Status do lead → Reunião)", () => {
    const c = (over: Partial<AutoFieldChange>): AutoFieldChange => ({ assigneeId: "natan", projectId: "p1", title: "Lead", field: "Status do lead", toValue: "Reunião", on: "2026-10-06", ...over });
    const changes = [c({}), c({ toValue: "reuniao" }), c({ toValue: "Fechado" }), c({ on: "2026-10-05" }), c({ assigneeId: "fernando" })];
    expect(run(rule({ type: "FIELD_CHANGED_TO", field: "status do lead", value: "Reunião" }), [], "2026-10-06", changes)).toBe(2);
  });

  it("converte números no formato brasileiro", () => {
    expect(toNumber("R$ 10.000,50")).toBe(10000.5);
    expect(toNumber("10000")).toBe(10000);
    expect(toNumber("")).toBeNull();
    expect(toNumber(null)).toBeNull();
  });

  it("regras inválidas são ignoradas", () => {
    expect(parseAutoRule(null)).toBeNull();
    expect(parseAutoRule({ type: "INEXISTENTE" })).toBeNull();
    expect(parseAutoRule({ type: "TASKS_COMPLETED" })).toEqual({ type: "TASKS_COMPLETED", projectIds: [] });
  });
});
