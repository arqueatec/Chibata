import { describe, expect, it } from "vitest";
import { computeAutoValue, parseAutoRule, toNumber, type AutoCrmEvent, type AutoFieldChange, type AutoRule, type AutoTask } from "@/lib/domain/autoIndicators";

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
const rule = (r: Partial<AutoRule> & Pick<AutoRule, "type">): AutoRule => ({ projectIds: [], segmentMode: "include", scope: "all", ...r });
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
    expect(parseAutoRule({ type: "TASKS_COMPLETED" })).toEqual({ type: "TASKS_COMPLETED", projectIds: [], segmentMode: "include", scope: "all" });
  });
});

describe("indicadores automáticos a partir do CRM", () => {
  const E = (over: Partial<AutoCrmEvent>): AutoCrmEvent => ({ type: "CONTACT", day: "2026-10-06", segment: "Agricultor médio ou grande porte", userEmail: "fernando@nofire.com.br", toStatus: null, volumeL: null, amount: null, ...over });
  const crm = (r: AutoRule, events: AutoCrmEvent[], emails: string[] = ["fernando@nofire.com.br"]) =>
    computeAutoValue({ rule: r, userId: "fernando", day: "2026-10-06", today: "2026-10-07", tasks: [], changes: [], crmEvents: events, crmEmails: emails });
  const bombeiros = "Corpo de Bombeiros / Defesa Civil";

  it("prospects privados x institucionais pelo segmento", () => {
    const events = [E({ type: "ACCOUNT_CREATED" }), E({ type: "ACCOUNT_CREATED", segment: bombeiros }), E({ type: "ACCOUNT_CREATED", day: "2026-10-05" })];
    expect(crm(rule({ type: "CRM_ACCOUNTS_CREATED" }), events)).toBe(2);
    expect(crm(rule({ type: "CRM_ACCOUNTS_CREATED", segment: "bombeiros" }), events)).toBe(1);
    expect(crm(rule({ type: "CRM_ACCOUNTS_CREATED", segment: "bombeiros", segmentMode: "exclude" }), events)).toBe(1);
  });

  it("contatos: equipe toda ou só os da pessoa", () => {
    const events = [E({}), E({ userEmail: "gustavo@nofire.com.br" }), E({ userEmail: null })];
    expect(crm(rule({ type: "CRM_CONTACTS" }), events)).toBe(3);
    expect(crm(rule({ type: "CRM_CONTACTS", scope: "person" }), events)).toBe(1);
  });

  it("etapa do funil por número ou por texto", () => {
    const events = [
      E({ type: "STATUS", toStatus: "5. Teste em andamento (amostra gratuita)" }),
      E({ type: "STATUS", toStatus: "8. Teste em andamento (amostra paga)" }),
      E({ type: "STATUS", toStatus: "15. Outra" }),
    ];
    expect(crm(rule({ type: "CRM_STATUS_REACHED", value: "5." }), events)).toBe(1);
    expect(crm(rule({ type: "CRM_STATUS_REACHED", value: "5" }), events)).toBe(1);
    expect(crm(rule({ type: "CRM_STATUS_REACHED", value: "teste em andamento" }), events)).toBe(2);
    expect(crm(rule({ type: "CRM_STATUS_REACHED" }), events)).toBe(0);
  });

  it("litros e receita vendidos no dia", () => {
    const events = [E({ type: "SALE", volumeL: 300, amount: 6000 }), E({ type: "SALE", volumeL: 200.5, amount: 4000 }), E({ type: "SALE", volumeL: 999, day: "2026-10-01" })];
    expect(crm(rule({ type: "CRM_LITERS_SOLD" }), events)).toBe(500.5);
    expect(crm(rule({ type: "CRM_REVENUE" }), events)).toBe(10000);
  });
});
