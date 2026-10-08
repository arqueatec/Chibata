import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { GrantForm } from "@/components/GrantForm";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { saveGrantsTeam } from "@/app/actions/grants";
import { requireAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatShortDay, todayKey } from "@/lib/domain/dates";
import { ACTIVE_PROJECT, GRANT_STATUS_LABEL, GRANT_STATUS_TONE, GRANT_STATUSES, grantAlerts, grantStats, PRE_SUBMISSION, type GrantStatus } from "@/lib/domain/grants";
import { formatValue } from "@/lib/format";
import { canSeeGrants } from "@/lib/grants/access";
import { loadGrants } from "@/lib/grants/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editais" };

export default async function GrantsPage() {
  const access = await requireAccess();
  if (!canSeeGrants(access)) notFound();
  const today = todayKey();
  const year = today.slice(0, 4);
  const [grants, people] = await Promise.all([
    loadGrants(),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, grantsTeam: true }, orderBy: { name: "asc" } }),
  ]);
  const stats = grantStats(grants, `${year}-01-01`, `${year}-12-31`);
  const alerts = grantAlerts(grants, today);

  const nextDeadline = (g: (typeof grants)[number]) => {
    if (PRE_SUBMISSION.includes(g.status)) return g.submissionDeadline ? { day: g.submissionDeadline, what: "submissão" } : null;
    if (ACTIVE_PROJECT.includes(g.status)) {
      const it = g.items.filter((i) => !i.done && i.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
      return it ? { day: it.dueDate!, what: it.title } : null;
    }
    if (g.status === "SUBMITTED" && g.resultExpected) return { day: g.resultExpected, what: "resultado previsto" };
    return null;
  };

  const groups = GRANT_STATUSES.map((s) => ({ status: s, list: grants.filter((g) => g.status === s) })).filter((g) => g.list.length > 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Editais" subtitle={`Submissões, aprovações e acompanhamento · ${year}`} actions={<a href="#novo" className="btn-primary btn-sm">+ Novo edital</a>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Em preparação" value={stats.inPreparation} hint="em análise ou preparando" />
        <Stat label="Aguardando resultado" value={stats.pending} hint={`${formatValue(stats.pendingAmount, "CURRENCY")} solicitados`} />
        <Stat
          label={`Aprovados em ${year}`}
          value={stats.approved}
          hint={`${stats.submitted} submetido(s) no ano · aprovação ${stats.approvalRate === null ? "—" : `${Math.round(stats.approvalRate * 100)}%`}`}
        />
        <Stat label={`Captado em ${year}`} value={formatValue(stats.approvedAmount, "CURRENCY")} hint={`${stats.active} projeto(s) em andamento`} />
      </div>

      {alerts.length > 0 && (
        <Card title="Prazos">
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={i}>
                <Link href={a.href} className={`flex items-start gap-2 rounded-lg p-2 text-sm hover:opacity-90 ${a.severity === "high" ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"}`}>
                  <span aria-hidden>{a.severity === "high" ? "⛔" : "⚠"}</span>
                  {a.text}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {groups.length === 0 ? (
        <Card>
          <Empty>Nenhum edital cadastrado ainda. Use “Novo edital” para começar.</Empty>
        </Card>
      ) : (
        groups.map(({ status, list }) => (
          <Card key={status} title={<span className="flex items-center gap-2"><Badge tone={GRANT_STATUS_TONE[status as GrantStatus]}>{GRANT_STATUS_LABEL[status as GrantStatus]}</Badge><span className="text-sm font-normal text-slate-500">{list.length}</span></span>}>
            <ul className="divide-y divide-slate-100">
              {list.map((g) => {
                const nd = nextDeadline(g);
                const late = nd && nd.day < today;
                const amount = g.approvedAmount ?? g.requestedAmount;
                return (
                  <li key={g.id}>
                    <Link href={`/editais/${g.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-slate-50">
                      <div className="min-w-0">
                        <div className="font-medium text-accent-700">{g.title}</div>
                        <div className="text-xs text-slate-500">
                          {g.funder}
                          {g.callName ? ` · ${g.callName}` : ""} · {g.ownerName}
                          {g.items.length > 0 && ` · ${g.items.filter((i) => i.done).length}/${g.items.length} itens concluídos`}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        {amount !== null && <div className="font-medium">{formatValue(amount, "CURRENCY")}{g.approvedAmount === null && <span className="text-xs text-slate-400"> solicitado</span>}</div>}
                        {nd && (
                          <div className={`text-xs ${late ? "font-semibold text-red-700" : "text-slate-500"}`}>
                            {late ? "atrasado · " : ""}
                            {nd.what} · {formatShortDay(nd.day)}
                          </div>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}

      <div id="novo" className="scroll-mt-20">
        <Card title="Novo edital">
          <GrantForm
            g={{ title: "", funder: "", callName: null, url: null, ownerId: access.user.id, requestedAmount: null, approvedAmount: null, counterpartAmount: null, submissionDeadline: null, resultExpected: null, executionStart: null, executionEnd: null, notes: null }}
            people={people}
          />
        </Card>
      </div>

      {access.isAdmin && (
        <Card title="Equipe de editais">
          <p className="mb-3 text-sm text-slate-600">Quem está marcado vê o menu Editais e pode cadastrar e atualizar editais. O administrador sempre tem acesso.</p>
          <ActionForm action={saveGrantsTeam} className="space-y-3">
            <div className="grid gap-1 sm:grid-cols-3">
              {people.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="member" value={p.id} defaultChecked={p.grantsTeam} className="h-4 w-4" />
                  {p.name}
                </label>
              ))}
            </div>
            <SubmitButton className="btn-primary btn-sm">Salvar equipe</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}

