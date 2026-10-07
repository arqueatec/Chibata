import "server-only";

/** Cliente mínimo da API do Asana (REST v1.0) com paginação e nova tentativa em caso de limite de requisições. */

export class AsanaError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "AsanaError";
  }
}

export function asanaConfigured() {
  return Boolean(process.env.ASANA_TOKEN);
}

function baseUrl() {
  return (process.env.ASANA_API_URL || "https://app.asana.com/api/1.0").replace(/\/$/, "");
}

type Params = Record<string, string | number | boolean | undefined>;

async function request<T>(method: "GET" | "PUT" | "POST", path: string, params: Params = {}, body?: unknown): Promise<T> {
  const token = process.env.ASANA_TOKEN;
  if (!token) throw new AsanaError("Integração com o Asana não configurada (falta ASANA_TOKEN).");
  const url = new URL(baseUrl() + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify({ data: body }) : undefined,
      cache: "no-store",
    });
    if (res.status === 429 && attempt < 3) {
      const wait = Math.min(30, Number(res.headers.get("Retry-After")) || 2 ** attempt);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let msg = text;
      try {
        msg = (JSON.parse(text) as { errors?: { message: string }[] }).errors?.map((e) => e.message).join("; ") || text;
      } catch {}
      if (res.status === 401) throw new AsanaError("Token do Asana inválido ou expirado. Gere um novo e atualize ASANA_TOKEN na Vercel.", 401);
      throw new AsanaError(`Asana respondeu ${res.status}: ${msg.slice(0, 300)}`, res.status);
    }
    return (await res.json()) as T;
  }
}

export async function asanaGet<T>(path: string, params: Params = {}): Promise<T> {
  return (await request<{ data: T }>("GET", path, params)).data;
}

/** Busca todas as páginas de uma listagem. */
export async function asanaGetAll<T>(path: string, params: Params = {}, max = 2000): Promise<T[]> {
  const out: T[] = [];
  let offset: string | undefined;
  do {
    const page = await request<{ data: T[]; next_page?: { offset: string } | null }>("GET", path, { ...params, limit: 100, offset });
    out.push(...page.data);
    offset = page.next_page?.offset;
  } while (offset && out.length < max);
  return out;
}

export async function asanaPut<T>(path: string, data: unknown): Promise<T> {
  return (await request<{ data: T }>("PUT", path, {}, data)).data;
}

export const TASK_FIELDS = [
  "name",
  "completed",
  "completed_at",
  "created_at",
  "modified_at",
  "due_on",
  "permalink_url",
  "num_subtasks",
  "assignee.email",
  "assignee.name",
  "custom_fields.name",
  "custom_fields.display_value",
  "custom_fields.number_value",
  "custom_fields.enum_value.name",
  "custom_fields.text_value",
].join(",");
