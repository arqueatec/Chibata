import { describe, expect, it } from "vitest";
import { checkInEditDecision, EDIT_WINDOW_BUSINESS_DAYS } from "@/lib/domain/editWindow";

describe("bloqueio de edição de check-in após o prazo", () => {
  const MONDAY = "2026-09-21";

  it("permite hoje e até 2 dias úteis para trás", () => {
    expect(EDIT_WINDOW_BUSINESS_DAYS).toBe(2);
    expect(checkInEditDecision({ date: MONDAY, today: MONDAY, isAdmin: false }).allowed).toBe(true);
    // segunda -> sexta (1 dia útil) e quinta (2 dias úteis)
    expect(checkInEditDecision({ date: "2026-09-18", today: MONDAY, isAdmin: false }).allowed).toBe(true);
    expect(checkInEditDecision({ date: "2026-09-17", today: MONDAY, isAdmin: false }).allowed).toBe(true);
  });

  it("fins de semana não consomem o prazo", () => {
    // sábado/domingo anteriores contam como dentro do prazo na segunda
    expect(checkInEditDecision({ date: "2026-09-19", today: MONDAY, isAdmin: false }).allowed).toBe(true);
    expect(checkInEditDecision({ date: "2026-09-20", today: MONDAY, isAdmin: false }).allowed).toBe(true);
  });

  it("bloqueia após 2 dias úteis para colaboradores", () => {
    const d = checkInEditDecision({ date: "2026-09-16", today: MONDAY, isAdmin: false });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toMatch(/prazo/);
    // quarta -> segunda anterior = 2 dias úteis (ok); sexta anterior = 3 (bloqueado)
    expect(checkInEditDecision({ date: "2026-09-21", today: "2026-09-23", isAdmin: false }).allowed).toBe(true);
    expect(checkInEditDecision({ date: "2026-09-18", today: "2026-09-23", isAdmin: false }).allowed).toBe(false);
  });

  it("administrador pode editar datas antigas", () => {
    expect(checkInEditDecision({ date: "2026-01-02", today: MONDAY, isAdmin: true }).allowed).toBe(true);
  });

  it("ninguém registra datas futuras", () => {
    expect(checkInEditDecision({ date: "2026-09-22", today: MONDAY, isAdmin: false }).allowed).toBe(false);
    expect(checkInEditDecision({ date: "2026-09-22", today: MONDAY, isAdmin: true }).allowed).toBe(false);
  });
});
