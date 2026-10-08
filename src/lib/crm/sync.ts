import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { addDays, keyToDate, todayKey } from "@/lib/domain/dates";
import { recomputeAutoIndicators } from "@/lib/services/autoIndicators";
import { crmConfigured, CrmError, fetchCrm } from "./client";

export interface CrmSyncReport {
  at: string;
  ok: boolean;
  trigger: string;
  durationMs: number;
  accounts: number;
  events: number;
  /** E-mails da equipe do CRM ainda sem pessoa vinculada no Chibata. */
  unmappedEmails: string[];
  crmUsers: { name: string; email: string }[];
  error?: string;
}

const KEY = "crm";
export const CRM_WINDOW_DAYS = 60;

export async function getCrmSettings(): Promise<{ lastSync?: CrmSyncReport }> {
  const row = await prisma.integrationSetting.findUnique({ where: { key: KEY } });
  return (row?.value ?? {}) as { lastSync?: CrmSyncReport };
}

async function saveCrmReport(report: CrmSyncReport) {
  const value = { lastSync: report } as unknown as Prisma.InputJsonValue;
  await prisma.integrationSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

const dayOf = (iso: string) => todayKey(new Date(iso));

let running: Promise<CrmSyncReport> | null = null;

/** Copia do CRM as contas (foto atual) e os eventos datados dos últimos 60 dias. Somente leitura no CRM. */
export function syncCrm(opts: { actorId: string | null; trigger: "cron" | "manual" | "auto" }) {
  running ??= doSync(opts).finally(() => (running = null));
  return running;
}

async function doSync(opts: { actorId: string | null; trigger: string }): Promise<CrmSyncReport> {
  const started = Date.now();
  const report: CrmSyncReport = { at: new Date().toISOString(), ok: false, trigger: opts.trigger, durationMs: 0, accounts: 0, events: 0, unmappedEmails: [], crmUsers: [] };
  try {
    const since = addDays(todayKey(), -CRM_WINDOW_DAYS);
    const data = await fetchCrm(since);
    const byId = new Map(data.accounts.map((a) => [a.id, a]));
    const now = new Date();

    const accounts: Prisma.CrmAccountCreateManyInput[] = data.accounts.map((a) => ({
      id: a.id,
      companyName: a.companyName,
      segment: a.segment,
      city: a.city,
      state: a.state,
      status: a.status,
      priority: a.priority,
      ownerEmail: a.ownerEmail?.toLowerCase() ?? null,
      nextAction: a.nextAction,
      nextActionDate: a.nextActionDate ? keyToDate(a.nextActionDate.slice(0, 10)) : null,
      lastContactDate: a.lastContactDate ? new Date(a.lastContactDate) : null,
      proposedVolumeL: a.proposedVolumeL,
      purchasedVolumeL: a.purchasedVolumeL,
      revenueTotal: a.revenueTotal,
      crmCreatedAt: new Date(a.createdAt),
      syncedAt: now,
    }));

    const name = (id: number) => byId.get(id)?.companyName ?? `Conta #${id}`;
    const seg = (id: number) => byId.get(id)?.segment ?? "";
    const events: Prisma.CrmEventCreateManyInput[] = [
      ...data.accounts
        .filter((a) => dayOf(a.createdAt) >= since)
        .map((a) => ({ id: `ACCOUNT_CREATED:${a.id}`, type: "ACCOUNT_CREATED", accountId: a.id, accountName: a.companyName, segment: a.segment, day: keyToDate(dayOf(a.createdAt)), at: new Date(a.createdAt), userEmail: a.ownerEmail?.toLowerCase() ?? null })),
      ...data.contacts.map((c) => ({
        id: `CONTACT:${c.id}`, type: "CONTACT", accountId: c.accountId, accountName: name(c.accountId), segment: seg(c.accountId),
        // data do contato é um dia de calendário (sem hora) no CRM
        day: keyToDate(c.date.slice(0, 10)), at: new Date(c.date), userEmail: c.teamMemberEmail?.toLowerCase() ?? null,
        text: `${c.channel}: ${c.subject}`.slice(0, 500),
      })),
      ...data.statusChanges.map((s) => ({
        id: `STATUS:${s.id}`, type: "STATUS", accountId: s.accountId, accountName: name(s.accountId), segment: seg(s.accountId),
        day: keyToDate(dayOf(s.changedAt)), at: new Date(s.changedAt), userEmail: s.userEmail?.toLowerCase() ?? null, toStatus: s.toStatus,
      })),
      ...data.sales.map((s) => ({
        id: `SALE:${s.id}`, type: "SALE", accountId: s.accountId, accountName: name(s.accountId), segment: seg(s.accountId),
        day: keyToDate(s.date.slice(0, 10)), at: new Date(s.date),
        // venda atribuída a quem registrou ou, na falta, ao responsável pela conta
        userEmail: (s.createdByEmail ?? byId.get(s.accountId)?.ownerEmail ?? null)?.toLowerCase() ?? null,
        volumeL: s.volumeL, amount: s.amount,
      })),
    ];

    // Substituição em lote numa única transação (sem ida e volta por linha, que estourava o tempo limite):
    // a foto das contas é trocada inteira e a janela de eventos também, então o que foi apagado ou corrigido no CRM some aqui.
    await prisma.$transaction([
      prisma.crmAccount.deleteMany(),
      prisma.crmAccount.createMany({ data: accounts, skipDuplicates: true }),
      prisma.crmEvent.deleteMany({ where: { day: { gte: keyToDate(since) } } }),
      prisma.crmEvent.createMany({ data: events, skipDuplicates: true }),
    ]);
    report.events = events.length;

    report.accounts = data.accounts.length;
    report.crmUsers = data.users.map((u) => ({ name: u.name, email: u.email.toLowerCase() }));
    const people = await prisma.user.findMany({ where: { active: true }, select: { email: true, crmEmails: true } });
    const known = new Set(people.flatMap((p) => [p.email.toLowerCase(), ...p.crmEmails.map((e) => e.toLowerCase())]));
    report.unmappedEmails = report.crmUsers.map((u) => u.email).filter((e) => !known.has(e));
    await recomputeAutoIndicators();
    report.ok = true;
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
    if (!(e instanceof CrmError)) console.error("[crm] falha na sincronização", e);
  }
  report.durationMs = Date.now() - started;
  await saveCrmReport(report);
  if (opts.trigger !== "auto") {
    await audit({ actorId: opts.actorId, entityType: "Integration", entityId: "crm", action: "SYNC", after: { ok: report.ok, contas: report.accounts, eventos: report.events, erro: report.error ?? null } });
  }
  return report;
}

/** Sincroniza se a última tiver mais de `maxAgeMin` minutos (usado ao abrir check-in/painel). */
export async function syncCrmIfStale(maxAgeMin = 10) {
  if (!crmConfigured()) return null;
  const last = (await getCrmSettings()).lastSync;
  if (last && Date.now() - new Date(last.at).getTime() < maxAgeMin * 60_000) return null;
  return syncCrm({ actorId: null, trigger: "auto" });
}

/** E-mails da pessoa no CRM: o de login e os vinculados. */
export function crmEmailsOf(u: { email: string; crmEmails: string[] }) {
  return [u.email, ...u.crmEmails].map((e) => e.toLowerCase());
}
