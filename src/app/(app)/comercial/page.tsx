import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { requireAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { canSeeCommercial } from "@/lib/crm/access";
import { crmAppUrl, crmConfigured } from "@/lib/crm/client";
import { getCrmSettings, syncCrmIfStale } from "@/lib/crm/sync";
import { addDays, dateToKey, endOfMonth, formatDay, formatShortDay, keyToDate, startOfMonth, todayKey } from "@/lib/domain/dates";
import { formatDateTime, formatNumber, formatValue } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comercial" };

const statusNumber = (s: string) => Number(s.match(/^(\d+)/)?.[1] ?? 99);
const CLOSED = new Set([11, 12]); // standby e perdido

export default async function CommercialPage() {
  const access = await requireAccess();
  if (!canSeeCommercial(access)) notFound();
  if (!crmConfigured()) {
    return (
      <div>
        <PageHeader title="Comercial" />
        <Empty>A integração com o CRM ainda não foi configurada. {access.isAdmin && <Link className="link" href="/admin/crm">Configurar</Link>}</Empty>
      </div>
    );
  }
  after(() => syncCrmIfStale(10).catch(() => null));

  const today = todayKey();
  const monthStart = startOfMonth(today);
  const crm = crmAppUrl();
  const [accounts, monthEvents, recentSales, recentContacts, people, settings] = await Promise.all([
    prisma.crmAccount.findMany(),
    prisma.crmEvent.findMany({ where: { day: { gte: keyToDate(monthStart), lte: keyToDate(endOfMonth(today)) } } }),
    prisma.crmEvent.findMany({ where: { type: "SALE" }, orderBy: { at: "desc" }, take: 8 }),
    prisma.crmEvent.findMany({ where: { type: "CONTACT" }, orderBy: [{ day: "desc" }, { at: "desc" }], take: 8 }),
    prisma.user.findMany({ select: { name: true, email: true, crmEmails: true } }),
    getCrmSettings(),
  ]);
  const nameOf = (email: string | null) => {
    if (!email) return "—";
    const p = people.find((u) => u.email.toLowerCase() === email || u.crmEmails.includes(email));
    return p?.name ?? settings.lastSync?.crmUsers.find((u) => u.email === email)?.name ?? email;
  };
  const link = (id: number) => `${crm}/pipeline/${id}`;

  const active = accounts.filter((a) => !CLOSED.has(statusNumber(a.status)));
  const clients = accounts.filter((a) => [9, 10].includes(statusNumber(a.status)));
  const sales = monthEvents.filter((e) => e.type === "SALE");
  const liters = sales.reduce((s, e) => s + (e.volumeL ?? 0), 0);
  const revenue = sales.reduce((s, e) => s + (e.amount ?? 0), 0);
  // Totais digitados nas contas do CRM (sem data): acumulado desde o início
  const litersTotal = accounts.reduce((s, a) => s + a.purchasedVolumeL, 0);
  const revenueTotal = accounts.reduce((s, a) => s + a.revenueTotal, 0);
  const contactsMonth = monthEvents.filter((e) => e.type === "CONTACT").length;
  const createdMonth = monthEvents.filter((e) => e.type === "ACCOUNT_CREATED").length;

  const funnel = new Map<string, number>();
  for (const a of accounts) funnel.set(a.status, (funnel.get(a.status) ?? 0) + 1);
  const funnelRows = [...funnel.entries()].sort((a, b) => statusNumber(a[0]) - statusNumber(b[0]));
  const maxFunnel = Math.max(1, ...funnelRows.map(([, n]) => n));

  const tomorrow = addDays(today, 1);
  const actions = active
    .filter((a) => a.nextActionDate && dateToKey(a.nextActionDate) <= tomorrow)
    .sort((a, b) => a.nextActionDate!.getTime() - b.nextActionDate!.getTime());
  const staleLimit = new Date(Date.now() - 30 * 86400_000);
  const stale = active
    .filter((a) => statusNumber(a.status) >= 2 && statusNumber(a.status) <= 9 && (!a.lastContactDate || a.lastContactDate < staleLimit))
    .sort((a, b) => (a.lastContactDate?.getTime() ?? 0) - (b.lastContactDate?.getTime() ?? 0));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Comercial"
        subtitle={<>Dados do CRM NoFire · atualizado {settings.lastSync ? formatDateTime(new Date(settings.lastSync.at)) : "—"}</>}
        actions={<a href={crm} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">Abrir o CRM ↗</a>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Litros vendidos no mês" value={`${formatNumber(liters)} L`} hint={`${sales.length} venda(s) · acumulado ${formatNumber(litersTotal)} L`} />
        <Stat label="Receita no mês" value={formatValue(revenue, "CURRENCY")} hint={`acumulado ${formatValue(revenueTotal, "CURRENCY")}`} />
        <Stat label="Contas no funil" value={active.length} hint={`${clients.length} cliente(s) · ${createdMonth} nova(s) no mês`} />
        <Stat label="Contatos no mês" value={contactsMonth} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Funil por etapa">
          {funnelRows.length === 0 ? (
            <Empty>Nenhuma conta no CRM.</Empty>
          ) : (
            <ul className="space-y-2">
              {funnelRows.map(([status, n]) => (
                <li key={status} className="text-sm">
                  <div className="mb-0.5 flex justify-between gap-2">
                    <span className={CLOSED.has(statusNumber(status)) ? "text-slate-400" : ""}>{status}</span>
                    <span className="font-semibold">{n}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className={`h-2 rounded-full ${CLOSED.has(statusNumber(status)) ? "bg-slate-300" : "bg-accent-600"}`} style={{ width: `${(n / maxFunnel) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={<span>Próximas ações até amanhã {actions.length > 0 && <Badge tone="yellow">{actions.length}</Badge>}</span>}>
          {actions.length === 0 ? (
            <Empty>Nenhuma próxima ação vencida ou para hoje/amanhã.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {actions.slice(0, 15).map((a) => {
                const due = dateToKey(a.nextActionDate!);
                return (
                  <li key={a.id} className={`py-2 ${due < today ? "border-l-4 border-l-red-400 pl-2" : ""}`}>
                    <div className="flex flex-wrap justify-between gap-2">
                      <a className="link" href={link(a.id)} target="_blank" rel="noopener noreferrer">{a.companyName}</a>
                      <span className={`text-xs ${due < today ? "font-semibold text-red-700" : "text-slate-500"}`}>
                        {due < today ? `atrasada · ${formatShortDay(due)}` : due === today ? "hoje" : "amanhã"}
                      </span>
                    </div>
                    <p className="text-slate-700">{a.nextAction ?? "—"}</p>
                    <p className="text-xs text-slate-500">{nameOf(a.ownerEmail)} · {a.status}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Vendas recentes">
          {recentSales.length === 0 ? (
            <Empty>Nenhuma venda registrada nos últimos 60 dias. As vendas são lançadas na seção “Vendas” de cada conta no CRM.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {recentSales.map((s) => (
                <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <a className="link" href={link(s.accountId)} target="_blank" rel="noopener noreferrer">{s.accountName}</a>
                    <span className="text-xs text-slate-500"> · {formatDay(dateToKey(s.day))} · {nameOf(s.userEmail)}</span>
                  </span>
                  <span className="font-semibold">
                    {formatNumber(s.volumeL ?? 0)} L{s.amount ? ` · ${formatValue(s.amount, "CURRENCY")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={<span>Contas sem contato há mais de 30 dias {stale.length > 0 && <Badge tone="red">{stale.length}</Badge>}</span>}>
          {stale.length === 0 ? (
            <Empty>Todas as contas em negociação tiveram contato recente.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {stale.slice(0, 12).map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <a className="link" href={link(a.id)} target="_blank" rel="noopener noreferrer">{a.companyName}</a>
                    <span className="text-xs text-slate-500"> · {a.status}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {a.lastContactDate ? `último contato ${formatDay(todayKey(a.lastContactDate))}` : "sem contato registrado"} · {nameOf(a.ownerEmail)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Contatos recentes">
        {recentContacts.length === 0 ? (
          <Empty>Nenhum contato registrado nos últimos 60 dias.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {recentContacts.map((c) => (
              <li key={c.id} className="py-2">
                <a className="link" href={link(c.accountId)} target="_blank" rel="noopener noreferrer">{c.accountName}</a>
                <span className="text-xs text-slate-500"> · {formatDay(dateToKey(c.day))} · {nameOf(c.userEmail)}</span>
                <p className="text-slate-700">{c.text}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
