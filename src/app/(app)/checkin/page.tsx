import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Badge, Card, PageHeader } from "@/components/ui";
import { deleteCheckIn, saveCheckIn } from "@/app/actions/checkin";
import { requireAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { canEditCheckIn } from "@/lib/domain/access";
import { addDays, dateToKey, formatDay, isBusinessDay, isDayKey, keyToDate, todayKey } from "@/lib/domain/dates";
import { EDIT_WINDOW_BUSINESS_DAYS } from "@/lib/domain/editWindow";
import { PERIOD_LABEL, UNIT_LABEL } from "@/lib/format";
import { indicatorsForUser } from "@/lib/services/indicators";
import { after } from "next/server";
import { refreshFromAsana } from "@/app/actions/asana";
import { asanaEnabled, syncIfStale } from "@/lib/asana/sync";
import { isCrmRule, parseAutoRule } from "@/lib/domain/autoIndicators";
import { checkInSuggestions } from "@/lib/services/checkinSuggestions";
import { crmConfigured } from "@/lib/crm/client";
import { syncCrmIfStale } from "@/lib/crm/sync";
import { ExtraTasks } from "@/components/ExtraTasks";
import { hasEvidence, notCountingReason } from "@/lib/domain/deliveries";

export const metadata = { title: "Check-in" };

const SCORES = [
  { v: 1, label: "Travado", emoji: "😣" },
  { v: 2, label: "Pouco", emoji: "😕" },
  { v: 3, label: "Ok", emoji: "😐" },
  { v: 4, label: "Bom", emoji: "🙂" },
  { v: 5, label: "Ótimo", emoji: "🚀" },
];

export default async function CheckInPage({ searchParams }: { searchParams: Promise<{ date?: string; user?: string }> }) {
  const access = await requireAccess();
  const sp = await searchParams;
  const today = todayKey();
  const date = sp.date && isDayKey(sp.date) ? sp.date : today;
  const userId = access.isAdmin && sp.user ? sp.user : access.user.id;
  const target = await prisma.user.findUnique({ where: { id: userId }, include: { area: true } });
  if (!target) notFound();

  const [existing, indicators, entries, recent, openTasks, doneNear, projects] = await Promise.all([
    prisma.checkIn.findUnique({ where: { userId_date: { userId, date: keyToDate(date) } } }),
    indicatorsForUser(userId),
    prisma.indicatorEntry.findMany({ where: { userId, date: keyToDate(date) } }),
    prisma.checkIn.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 7, select: { id: true, date: true, selfScore: true, blockers: true, blockerResolvedAt: true } }),
    // Entregas: tarefas abertas para marcar como concluídas e as já concluídas no dia
    prisma.task.findMany({
      where: { assigneeId: userId, status: { not: "DONE" } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 40,
      include: { project: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: { assigneeId: userId, status: "DONE", completedAt: { gte: new Date(`${addDays(date, -1)}T00:00:00.000Z`), lt: new Date(`${addDays(date, 2)}T00:00:00.000Z`) } },
      orderBy: { completedAt: "asc" },
      include: { project: { select: { name: true } } },
    }),
    prisma.project.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, asanaGid: true } }),
  ]);
  const doneToday = doneNear.filter((t) => t.completedAt && todayKey(t.completedAt) === date);
  const decision = canEditCheckIn(access.ctx, userId, date, today);
  const locked = !decision.allowed;

  // Atalhos: hoje e dias anteriores dentro da janela de edição
  const shortcuts: string[] = [today];
  for (let d = addDays(today, -1); shortcuts.length < 4; d = addDays(d, -1)) {
    if (canEditCheckIn(access.ctx, userId, d, today).allowed && isBusinessDay(d)) shortcuts.push(d);
    if (d < addDays(today, -10)) break;
  }
  const entryOf = (id: string) => entries.find((e) => e.indicatorId === id)?.value;
  const qs = (d: string) => `/checkin?date=${d}${userId !== access.user.id ? `&user=${userId}` : ""}`;
  // Pré-preenchimento a partir das tarefas (Asana/app) e do CRM, para o check-in ainda não feito
  const integration = await asanaEnabled();
  if (integration) after(() => syncIfStale(10).catch(() => null));
  if (crmConfigured() && target.crmEmails.length > 0) after(() => syncCrmIfStale(10).catch(() => null));
  const suggestions = !existing ? await checkInSuggestions(userId, date, target.crmEmails.length ? [target.email, ...target.crmEmails] : []) : null;
  const defaultDone = existing?.yesterday ?? (suggestions?.done.length ? suggestions.done.join("\n") : "");
  const dueLabel = (d: Date | null) => {
    if (!d) return null;
    const k = dateToKey(d);
    return k < date ? { text: `atrasada · ${formatDay(k).slice(0, 5)}`, late: true } : { text: k === date ? "vence hoje" : `prazo ${formatDay(k).slice(0, 5)}`, late: false };
  };
  const autoIds = new Set(indicators.filter((i) => parseAutoRule(i.autoRule)).map((i) => i.id));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={userId === access.user.id ? "Check-in diário" : `Check-in de ${target.name}`}
        subtitle={<>{formatDay(date, true)}{existing ? " · já registrado (editando)" : ""}</>}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {shortcuts.map((d) => (
          <Link key={d} href={qs(d)} className={`btn-sm btn ${d === date ? "bg-brand-600 text-white" : "border border-slate-300 bg-white"}`}>
            {d === today ? "Hoje" : formatDay(d, true).split(",")[0]} {d !== today && formatDay(d).slice(0, 5)}
          </Link>
        ))}
        <form className="flex items-center gap-1" action="/checkin">
          {userId !== access.user.id && <input type="hidden" name="user" value={userId} />}
          <input type="date" name="date" defaultValue={date} max={today} className="input !w-auto !py-1 text-sm" aria-label="Escolher data" />
          <button className="btn-secondary btn-sm" type="submit">Ir</button>
        </form>
      </div>

      {integration && userId === access.user.id && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Tarefas e indicadores automáticos vêm do Asana.</span>
          <ActionForm action={refreshFromAsana} className="flex items-center gap-2">
            <SubmitButton className="btn-secondary btn-sm" pendingText="Atualizando…">↻ Atualizar com o Asana</SubmitButton>
          </ActionForm>
        </div>
      )}

      {locked && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          🔒 {decision.reason}
        </div>
      )}
      {!locked && !isBusinessDay(date) && (
        <div className="mb-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">Este é um fim de semana — o registro é opcional e não conta na regularidade.</div>
      )}

      <ActionForm action={saveCheckIn}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="date" value={date} />
        <fieldset disabled={locked} className="space-y-4">
          <Card>
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="yesterday">O que você fez {date === today ? "hoje" : "neste dia"}?</label>
                <textarea id="yesterday" name="yesterday" rows={4} required maxLength={2000} defaultValue={defaultDone} className="input" placeholder="Principais entregas, reuniões, avanços…" />
                {!existing && suggestions?.done.length ? (
                  <p className="hint">Pré-preenchido com o que foi concluído no dia (tarefas e CRM). Ajuste se necessário. As tarefas que contam na nota são as marcadas em “Entregas do dia”, abaixo.</p>
                ) : (
                  <p className="hint">Resumo do dia. As tarefas que contam na nota são as marcadas em “Entregas do dia”, abaixo.</p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="blockers">Bloqueios ou pedidos de ajuda <span className="font-normal text-slate-400">(opcional)</span></label>
                <textarea id="blockers" name="blockers" rows={2} maxLength={2000} defaultValue={existing?.blockers ?? ""} className="input" placeholder="O que está impedindo seu avanço?" />
                {suggestions && suggestions.blocked.length > 0 && (
                  <p className="hint text-amber-800">
                    Tarefas bloqueadas: {suggestions.blocked.map((b) => `${b.title}${b.reason ? ` (${b.reason})` : ""}`).join("; ")}
                  </p>
                )}
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" name="needsHelp" defaultChecked={existing?.needsHelp} className="h-5 w-5 rounded border-slate-300" />
                  Preciso de ajuda do(a) gestor(a) com isso
                </label>
              </div>
              <div>
                <span className="label">Como foi o progresso do dia?</span>
                <div className="grid grid-cols-5 gap-2" role="radiogroup">
                  {SCORES.map((s) => (
                    <label key={s.v} className="cursor-pointer">
                      <input type="radio" name="selfScore" value={s.v} defaultChecked={existing?.selfScore === s.v} required className="peer sr-only" />
                      <span className="flex flex-col items-center rounded-lg border border-slate-300 bg-white py-2 text-xs peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500">
                        <span className="text-xl" aria-hidden>{s.emoji}</span>
                        <span className="font-semibold">{s.v}</span>
                        <span className="hidden sm:block">{s.label}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card title="Entregas do dia">
            <p className="mb-3 text-xs text-slate-500">
              Marque o que você concluiu {date === today ? "hoje" : "neste dia"} e registre as demandas que surgiram e já foram feitas. É isso que conta como entrega na nota.
              Evidência: anexe o arquivo na tarefa do Asana ou cole um link aqui.
            </p>
            {doneToday.length > 0 && (
              <ul className="mb-3 space-y-2">
                {doneToday.map((t) => {
                  const why = notCountingReason(t);
                  return (
                    <li key={t.id} className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span aria-hidden className="text-emerald-700">✓</span>
                        <span className="font-medium">{t.title}</span>
                        {t.unplanned && <Badge tone="yellow">demanda extra</Badge>}
                        {t.project && <span className="text-xs text-slate-500">{t.project.name}</span>}
                        {hasEvidence(t) && <Badge tone="green">📎 com evidência</Badge>}
                        {why && <Badge tone="red">não conta: {why}</Badge>}
                      </div>
                      {!t.asanaAttachments && (
                        <input name={`evidence_${t.id}`} type="url" defaultValue={t.evidenceUrl ?? ""} placeholder={t.requiresEvidence ? "Link da evidência (obrigatória)" : "Link da evidência (opcional)"} className="input mt-2 !py-1 text-sm" aria-label={`Evidência de ${t.title}`} />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {openTasks.length > 0 ? (
              <details className="mb-3 rounded-lg border border-slate-200 p-2" open={doneToday.length === 0}>
                <summary className="cursor-pointer text-sm font-medium">Concluí tarefas planejadas ({openTasks.length} em aberto)</summary>
                <ul className="mt-2 space-y-2">
                  {openTasks.map((t) => {
                    const due = dueLabel(t.dueDate);
                    return (
                      <li key={t.id} className="text-sm">
                        <label className="flex items-start gap-2">
                          <input type="checkbox" name="complete" value={t.id} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300" />
                          <span>
                            {t.title}
                            <span className="ml-1 text-xs text-slate-500">
                              {t.project ? `· ${t.project.name} ` : ""}
                              {due && <span className={due.late ? "text-red-700" : ""}>· {due.text}</span>}
                            </span>
                            {t.requiresEvidence && <span className="ml-1"><Badge tone="yellow">exige evidência</Badge></span>}
                          </span>
                        </label>
                        <input name={`evidence_${t.id}`} type="url" defaultValue={t.evidenceUrl ?? ""} placeholder={`Link da evidência${t.requiresEvidence ? " (obrigatória)" : " (opcional)"}${t.asanaGid ? " ou anexe no Asana" : ""}`} className="input mt-1 ml-7 !w-[calc(100%-1.75rem)] !py-1 text-xs" aria-label={`Evidência de ${t.title}`} />
                      </li>
                    );
                  })}
                </ul>
              </details>
            ) : (
              <p className="mb-3 text-sm text-slate-500">Nenhuma tarefa planejada em aberto.</p>
            )}
            <ExtraTasks projects={projects.map((p) => ({ id: p.id, name: p.name, asana: !!p.asanaGid }))} asanaHint={integration} />
          </Card>

          {indicators.length > 0 && (
            <Card title="Indicadores do dia">
              <p className="mb-3 text-xs text-slate-500">Informe o que foi realizado neste dia. Deixe em branco o que não se aplica.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {indicators.map((ind) =>
                  autoIds.has(ind.id) ? (
                    <div key={ind.id}>
                      <span className="label">
                        {ind.name}
                        {ind.unit !== "COUNT" && <span className="font-normal text-slate-400"> ({UNIT_LABEL[ind.unit]})</span>}
                      </span>
                      <div className="input flex items-center justify-between bg-slate-50 text-slate-700">
                        <span>{(entryOf(ind.id) ?? 0).toLocaleString("pt-BR")}</span>
                        <Badge tone="blue">automático</Badge>
                      </div>
                      <p className="hint">{isCrmRule(parseAutoRule(ind.autoRule)!.type) ? "Calculado pelo CRM" : `Calculado pelas tarefas${integration ? " do Asana" : ""}`} · meta {PERIOD_LABEL[ind.targetPeriod]}: {ind.targetValue.toLocaleString("pt-BR")}</p>
                    </div>
                  ) : (
                  <div key={ind.id}>
                    <label className="label" htmlFor={`ind_${ind.id}`}>
                      {ind.name}
                      {ind.unit !== "COUNT" && <span className="font-normal text-slate-400"> ({UNIT_LABEL[ind.unit]})</span>}
                    </label>
                    <input
                      id={`ind_${ind.id}`}
                      name={`ind_${ind.id}`}
                      inputMode="decimal"
                      pattern="[0-9.,\s]*"
                      defaultValue={entryOf(ind.id)?.toString().replace(".", ",") ?? ""}
                      className="input"
                      placeholder="0"
                    />
                    <p className="hint">
                      {ind.aggregation === "LAST" ? "Valor atual (estoque) · " : ""}
                      Meta {PERIOD_LABEL[ind.targetPeriod]}: {ind.direction === "LOWER_BETTER" ? "até " : ""}
                      {ind.targetValue.toLocaleString("pt-BR")}
                      {ind.ownerId && " · pessoal"}
                    </p>
                  </div>
                  ),
                )}
              </div>
            </Card>
          )}

          {!locked && (
            <div className="sticky bottom-20 z-10 md:bottom-4">
              <SubmitButton className="btn-primary w-full shadow-lg">{existing ? "Atualizar check-in" : "Salvar check-in"}</SubmitButton>
            </div>
          )}
        </fieldset>
      </ActionForm>

      <p className="mt-3 text-xs text-slate-500">
        Você pode registrar ou corrigir o check-in até {EDIT_WINDOW_BUSINESS_DAYS} dias úteis depois da data. Depois disso, apenas o administrador pode editar. Todas as alterações ficam registradas na auditoria.
      </p>

      {access.isAdmin && existing && (
        <div className="mt-4">
          <ActionForm action={deleteCheckIn} confirm="Excluir este check-in e os lançamentos de indicadores do dia? A ação fica registrada na auditoria.">
            <input type="hidden" name="id" value={existing.id} />
            <SubmitButton className="btn-danger btn-sm" pendingText="Excluindo…">Excluir check-in (admin)</SubmitButton>
          </ActionForm>
        </div>
      )}

      <Card title="Últimos check-ins" className="mt-6">
        <ul className="divide-y divide-slate-100 text-sm">
          {recent.map((c) => {
            const k = dateToKey(c.date);
            return (
              <li key={c.id} className="flex items-center justify-between py-2">
                <Link href={qs(k)} className="link">{formatDay(k, true)}</Link>
                <span className="flex gap-1">
                  {c.blockers && <Badge tone={c.blockerResolvedAt ? "gray" : "red"}>{c.blockerResolvedAt ? "bloqueio resolvido" : "bloqueio"}</Badge>}
                  <Badge tone="brand">{c.selfScore}/5</Badge>
                </span>
              </li>
            );
          })}
          {recent.length === 0 && <li className="py-2 text-slate-500">Nenhum check-in ainda.</li>}
        </ul>
      </Card>
    </div>
  );
}
