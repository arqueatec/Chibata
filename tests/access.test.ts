import { describe, expect, it } from "vitest";
import {
  buildAccessContext,
  canAssignTask,
  canDeleteCheckIn,
  canEditCheckIn,
  canEditTask,
  canGiveFeedback,
  canManageOrganization,
  canManagePersonalIndicator,
  canReopenReview,
  canViewUser,
  canWriteReview,
  subordinateIds,
  visibleUserIds,
  type Actor,
  type LeadershipLink,
} from "@/lib/domain/access";

const team: LeadershipLink[] = [
  { id: "yago", managerId: null },
  { id: "fernando", managerId: "yago" },
  { id: "brenda", managerId: "yago" },
  { id: "junior", managerId: "yago" },
  { id: "ilaria", managerId: "yago" },
  { id: "natan", managerId: "ilaria" },
];

const actor = (id: string, role: Actor["role"], active = true): Actor => ({ id, role, active });
const ctxOf = (a: Actor, users = team) => buildAccessContext(a, users);

const yago = ctxOf(actor("yago", "ADMIN"));
const ilaria = ctxOf(actor("ilaria", "COORDINATOR"));
const natan = ctxOf(actor("natan", "COLLABORATOR"));
const fernando = ctxOf(actor("fernando", "COLLABORATOR"));
const TODAY = "2026-09-23";

describe("hierarquia de liderança", () => {
  it("calcula liderados diretos e indiretos a partir dos dados", () => {
    expect([...subordinateIds("ilaria", team)]).toEqual(["natan"]);
    expect(subordinateIds("yago", team).size).toBe(5);
    // nova relação sem mudar código: Natan passa a liderar um estagiário
    const extended = [...team, { id: "estagiario", managerId: "natan" }];
    expect(subordinateIds("ilaria", extended)).toEqual(new Set(["natan", "estagiario"]));
  });
  it("é resistente a ciclos", () => {
    const cyc = [
      { id: "a", managerId: "b" },
      { id: "b", managerId: "a" },
    ];
    expect(subordinateIds("a", cyc)).toEqual(new Set(["b"]));
  });
});

describe("administrador (CEO)", () => {
  it("vê tudo e gerencia a organização", () => {
    for (const u of team) expect(canViewUser(yago, u.id)).toBe(true);
    expect(visibleUserIds(yago)).toBeNull();
    expect(canManageOrganization(yago)).toBe(true);
    expect(canReopenReview(yago)).toBe(true);
    expect(canDeleteCheckIn(yago)).toBe(true);
    expect(canGiveFeedback(yago, "natan")).toBe(true);
  });
  it("pode editar check-in de qualquer pessoa fora do prazo", () => {
    expect(canEditCheckIn(yago, "fernando", "2026-08-01", TODAY).allowed).toBe(true);
  });
});

describe("coordenadora (Ilaria) e assistente (Natan)", () => {
  it("Ilaria vê os próprios dados e os do Natan, e nada além disso", () => {
    expect(canViewUser(ilaria, "ilaria")).toBe(true);
    expect(canViewUser(ilaria, "natan")).toBe(true);
    expect(canViewUser(ilaria, "fernando")).toBe(false);
    expect(canViewUser(ilaria, "yago")).toBe(false);
    expect(visibleUserIds(ilaria)).toEqual(new Set(["ilaria", "natan"]));
  });
  it("Ilaria comenta e redige revisões do Natan, mas não de outros nem de si mesma", () => {
    expect(canGiveFeedback(ilaria, "natan")).toBe(true);
    expect(canWriteReview(ilaria, "natan")).toBe(true);
    expect(canGiveFeedback(ilaria, "brenda")).toBe(false);
    expect(canGiveFeedback(ilaria, "ilaria")).toBe(false);
  });
  it("Ilaria não reabre revisões nem gerencia a organização", () => {
    expect(canReopenReview(ilaria)).toBe(false);
    expect(canManageOrganization(ilaria)).toBe(false);
  });
  it("Ilaria não edita o check-in do Natan (apenas vê e comenta)", () => {
    expect(canEditCheckIn(ilaria, "natan", TODAY, TODAY).allowed).toBe(false);
  });
  it("Ilaria pode atribuir e editar tarefas do Natan", () => {
    expect(canAssignTask(ilaria, "natan")).toBe(true);
    expect(canEditTask(ilaria, { assigneeId: "natan", createdById: "yago" })).toBe(true);
    expect(canAssignTask(ilaria, "junior")).toBe(false);
  });
  it("Natan não vê os dados da Ilaria nem dá feedback a ela", () => {
    expect(canViewUser(natan, "natan")).toBe(true);
    expect(canViewUser(natan, "ilaria")).toBe(false);
    expect(canGiveFeedback(natan, "ilaria")).toBe(false);
  });
  it("coordenador sem liderados não vê ninguém além de si", () => {
    const solo = ctxOf(actor("brenda", "COORDINATOR"));
    expect(canViewUser(solo, "natan")).toBe(false);
  });
  it("um liderado só é considerado se o papel for de coordenador", () => {
    // Se Ilaria for rebaixada a colaboradora, perde o acesso ao Natan
    const demoted = ctxOf(actor("ilaria", "COLLABORATOR"));
    expect(canViewUser(demoted, "natan")).toBe(false);
  });
});

describe("colaborador", () => {
  it("registra e consulta apenas os próprios dados", () => {
    expect(canViewUser(fernando, "fernando")).toBe(true);
    expect(canViewUser(fernando, "brenda")).toBe(false);
    expect(canEditCheckIn(fernando, "fernando", TODAY, TODAY).allowed).toBe(true);
    expect(canEditCheckIn(fernando, "brenda", TODAY, TODAY).allowed).toBe(false);
    expect(canDeleteCheckIn(fernando)).toBe(false);
    expect(canAssignTask(fernando, "brenda")).toBe(false);
    expect(canAssignTask(fernando, "fernando")).toBe(true);
  });
  it("não edita o próprio check-in após o prazo", () => {
    expect(canEditCheckIn(fernando, "fernando", "2026-09-17", TODAY).allowed).toBe(false);
  });
  it("usuário inativo não tem acesso", () => {
    const inactive = ctxOf(actor("fernando", "COLLABORATOR", false));
    expect(canViewUser(inactive, "fernando")).toBe(false);
    const inactiveAdmin = ctxOf(actor("yago", "ADMIN", false));
    expect(canViewUser(inactiveAdmin, "natan")).toBe(false);
    expect(canManageOrganization(inactiveAdmin)).toBe(false);
  });
  it("indicadores pessoais só se a área permitir", () => {
    expect(canManagePersonalIndicator(fernando, "fernando", false)).toBe(false);
    expect(canManagePersonalIndicator(fernando, "fernando", true)).toBe(true);
    expect(canManagePersonalIndicator(fernando, "brenda", true)).toBe(false);
  });
});
