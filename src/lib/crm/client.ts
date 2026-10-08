import "server-only";

/** Leitura da API de integração do CRM NoFire (GET /api/integracao/chibata). */

export class CrmError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "CrmError";
  }
}

export function crmConfigured() {
  return Boolean(process.env.CRM_API_URL && process.env.CRM_API_TOKEN);
}

/** Endereço do CRM para os links "Abrir no CRM". */
export function crmAppUrl() {
  return (process.env.CRM_APP_URL || process.env.CRM_API_URL || "").replace(/\/$/, "");
}

export interface CrmPayload {
  generatedAt: string;
  users: { id: string; name: string; email: string }[];
  accounts: {
    id: number;
    companyName: string;
    segment: string;
    city: string;
    state: string;
    status: string;
    priority: string;
    nextAction: string | null;
    nextActionDate: string | null;
    lastContactDate: string | null;
    proposedVolumeL: number;
    purchasedVolumeL: number;
    revenueTotal: number;
    createdAt: string;
    ownerEmail: string | null;
  }[];
  contacts: { id: number; accountId: number; date: string; channel: string; subject: string; nextStep: string | null; teamMemberEmail: string | null }[];
  statusChanges: { id: number; accountId: number; fromStatus: string | null; toStatus: string; changedAt: string; userEmail: string | null }[];
  sales: { id: number; accountId: number; date: string; volumeL: number; amount: number; createdByEmail: string | null }[];
}

export async function fetchCrm(since: string): Promise<CrmPayload> {
  if (!crmConfigured()) throw new CrmError("Integração com o CRM não configurada (faltam CRM_API_URL e CRM_API_TOKEN).");
  const base = process.env.CRM_API_URL!.replace(/\/$/, "");
  const headers: Record<string, string> = { Authorization: `Bearer ${process.env.CRM_API_TOKEN}`, Accept: "application/json" };
  // O CRM fica atrás da proteção de deploy da Vercel: este segredo libera chamadas de servidor.
  if (process.env.CRM_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = process.env.CRM_BYPASS_SECRET;
  let res: Response;
  try {
    res = await fetch(`${base}/api/integracao/chibata?desde=${since}`, { headers, cache: "no-store", signal: AbortSignal.timeout(20000) });
  } catch {
    throw new CrmError("Não foi possível conectar ao CRM.");
  }
  if (res.status === 401) {
    const text = await res.text().catch(() => "");
    throw new CrmError(
      text.includes("Não autorizado")
        ? "O CRM recusou o token: confira se CRM_API_TOKEN no Chibata é igual a CHIBATA_API_TOKEN no CRM."
        : "A proteção da Vercel bloqueou o acesso ao CRM: confira CRM_BYPASS_SECRET.",
      401,
    );
  }
  if (res.status === 404) throw new CrmError("O CRM ainda não tem a integração (atualize o CRM com o PR de integração).", 404);
  if (!res.ok) throw new CrmError(`O CRM respondeu ${res.status}.`, res.status);
  return (await res.json()) as CrmPayload;
}
