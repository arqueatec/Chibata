import { describe, expect, it } from "vitest";
import { customFieldsMap, isSampleTask, statusFromAsana, suggestUserFor, userForAsanaEmail, type AppUserRef } from "@/lib/asana/mapping";

const users: AppUserRef[] = [
  { id: "y", name: "Yago", email: "yago@arqueatec.com.br", asanaEmails: ["yago.rodrigues@ufpe.br"] },
  { id: "f", name: "Fernando", email: "fernando@arqueatec.com.br", asanaEmails: [] },
  { id: "j", name: "Junior", email: "junior@arqueatec.com.br", asanaEmails: [] },
  { id: "b", name: "Brenda", email: "brenda@arqueatec.com.br", asanaEmails: ["brenda.violane@ufpe.br", "brendaviolane@gmail.com"] },
];

describe("mapeamento Asana → app", () => {
  it("status: concluída, bloqueada, em andamento ou a fazer (campo Status)", () => {
    const f = (v: string) => [{ name: "Status", display_value: v, enum_value: { name: v } }];
    expect(statusFromAsana({ completed: true, custom_fields: f("Em andamento") }).status).toBe("DONE");
    expect(statusFromAsana({ completed: false, custom_fields: f("Em andamento") }).status).toBe("IN_PROGRESS");
    expect(statusFromAsana({ completed: false, custom_fields: f("Bloqueado") })).toEqual({ status: "BLOCKED", blockedReason: "Marcada como bloqueada no Asana" });
    expect(statusFromAsana({ completed: false, custom_fields: f("Não iniciado") }).status).toBe("TODO");
    expect(statusFromAsana({ completed: false }).status).toBe("TODO");
  });

  it("campos personalizados: número, opção e texto", () => {
    expect(
      customFieldsMap([
        { name: "Valor estimado", number_value: 10000, display_value: "10000" },
        { name: "Status do lead", enum_value: { name: "Qualificação" }, display_value: "Qualificação" },
        { name: "Nome da conta", display_value: "IBAMA" },
        { name: "Prioridade", display_value: null },
      ]),
    ).toEqual({ "Valor estimado": 10000, "Status do lead": "Qualificação", "Nome da conta": "IBAMA", Prioridade: null });
  });

  it("ignora as tarefas de exemplo do Asana", () => {
    expect(isSampleTask("[TAREFA DE EXEMPLO] Novo cliente em potencial")).toBe(true);
    expect(isSampleTask("Prospecção de Clientes")).toBe(false);
  });

  it("vincula pelo e-mail de login ou pelos e-mails do Asana cadastrados (várias contas)", () => {
    expect(userForAsanaEmail("BRENDAVIOLANE@gmail.com", users)?.id).toBe("b");
    expect(userForAsanaEmail("brenda.violane@ufpe.br", users)?.id).toBe("b");
    expect(userForAsanaEmail("fernando@arqueatec.com.br", users)?.id).toBe("f");
    expect(userForAsanaEmail("fernando@metalshop.com.br", users)).toBeNull();
  });

  it("sugere vínculo pelo primeiro nome quando o e-mail não coincide", () => {
    expect(suggestUserFor({ email: "fernando@metalshop.com.br", name: "fernando@metalshop.com.br" }, users)?.id).toBe("f");
    expect(suggestUserFor({ email: "natan.silva@ufpe.br", name: "JOSE NATAN OLIVEIRA DA SILVA" }, users)).toBeNull();
    expect(suggestUserFor({ email: "yago.rodrigues@ufpe.br", name: "JOSE YAGO" }, users)?.id).toBe("y");
  });
});
