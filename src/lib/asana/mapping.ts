/**
 * Conversões puras entre os dados do Asana e o modelo do app (testáveis sem rede).
 */
import { normalize } from "@/lib/domain/autoIndicators";

export interface AsanaCustomField {
  name: string;
  type?: string;
  resource_subtype?: string;
  display_value?: string | null;
  number_value?: number | null;
  enum_value?: { name: string } | null;
  text_value?: string | null;
}

export interface AsanaTask {
  gid: string;
  name: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  due_on: string | null;
  modified_at?: string;
  permalink_url?: string;
  num_subtasks?: number;
  assignee: { gid: string; email?: string | null; name?: string } | null;
  custom_fields?: AsanaCustomField[];
}

export type AppStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";

/** Tarefas de exemplo que o Asana cria em modelos de projeto. */
export function isSampleTask(name: string) {
  const n = name.trim();
  return /^\[\s*tarefa de exemplo\s*\]/i.test(n) || /^\[\s*sample task\s*\]/i.test(n);
}

export function customFieldsMap(fields: AsanaCustomField[] | undefined): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const f of fields ?? []) {
    if (!f.name) continue;
    if (typeof f.number_value === "number") out[f.name] = f.number_value;
    else if (f.enum_value?.name) out[f.name] = f.enum_value.name;
    else out[f.name] = f.display_value ?? f.text_value ?? null;
  }
  return out;
}

/** Status no app: concluída no Asana → DONE; campo "Status" com "bloque…" → BLOCKED; "andamento" → IN_PROGRESS. */
export function statusFromAsana(t: Pick<AsanaTask, "completed" | "custom_fields">): { status: AppStatus; blockedReason: string | null } {
  if (t.completed) return { status: "DONE", blockedReason: null };
  const fields = customFieldsMap(t.custom_fields);
  const statusKey = Object.keys(fields).find((k) => normalize(k) === "status");
  const v = statusKey ? normalize(String(fields[statusKey] ?? "")) : "";
  if (v.includes("bloque") || v.includes("block")) return { status: "BLOCKED", blockedReason: "Marcada como bloqueada no Asana" };
  if (v.includes("andamento") || v.includes("progress") || v.includes("fazendo")) return { status: "IN_PROGRESS", blockedReason: null };
  return { status: "TODO", blockedReason: null };
}

export interface AppUserRef {
  id: string;
  name: string;
  email: string;
  asanaEmails: string[];
}

/** Localiza a pessoa do app pelo e-mail do Asana (e-mail de login ou e-mails do Asana cadastrados). */
export function userForAsanaEmail(email: string | null | undefined, users: AppUserRef[]): AppUserRef | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return users.find((u) => u.email.toLowerCase() === e || u.asanaEmails.some((a) => a.toLowerCase() === e)) ?? null;
}

/**
 * Sugestão de vínculo para uma conta do Asana: e-mail exato ou, na falta, primeiro nome
 * (do nome ou da parte antes do @) igual ao primeiro nome de uma única pessoa do app.
 */
export function suggestUserFor(asana: { email: string | null; name: string }, users: AppUserRef[]): AppUserRef | null {
  const exact = userForAsanaEmail(asana.email, users);
  if (exact) return exact;
  const tokens = new Set(
    [asana.name, (asana.email ?? "").split("@")[0]]
      .flatMap((s) => normalize(s).split(/[^a-z]+/))
      .filter((t) => t.length >= 3),
  );
  const candidates = users.filter((u) => tokens.has(normalize(u.name).split(/\s+/)[0]));
  return candidates.length === 1 ? candidates[0] : null;
}
