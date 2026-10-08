import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { GrantForm } from "@/components/GrantForm";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { addGrantItem, changeGrantStatus, deleteGrant, deleteGrantItem, toggleGrantItem } from "@/app/actions/grants";
import { requireAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { formatShortDay, todayKey } from "@/lib/domain/dates";
import { GRANT_ITEM_KINDS, GRANT_ITEM_LABEL, GRANT_STATUS_LABEL, GRANT_STATUS_TONE, GRANT_STATUSES } from "@/lib/domain/grants";
import { formatValue } from "@/lib/format";
import { canSeeGrants } from "@/lib/grants/access";
import { loadGrants } from "@/lib/grants/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edital" };

export default async function GrantPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireAccess();
  if (!canSeeGrants(access)) notFound();
  const { id } = await params;
  const [[g], people] = await Promise.all([
    loadGrants({ id }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!g) notFound();
  const today = todayKey();
  const money = (v: number | null) => (v === null ? "—" : formatValue(v, "CURRENCY"));
  const received = g.items.filter((i) => i.kind === "INSTALLMENT" && i.done).reduce((s, i) => s + (i.amount ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={g.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={GRANT_STATUS_TONE[g.status]}>{GRANT_STATUS_LABEL[g.status]}</Badge>
            {g.funder}
            {g.callName ? ` · ${g.callName}` : ""} · responsável: {g.ownerName}
          </span>
        }
        actions={
          <>
            <Link href="/editais" className="btn-secondary btn-sm">← Editais</Link>
            {g.url && <a href={g.url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">Abrir edital ↗</a>}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
        <div className="card"><div className="text-xs text-slate-500 uppercase">Solicitado</div><div className="text-lg font-bold">{money(g.requestedAmount)}</div></div>
        <div className="card"><div className="text-xs text-slate-500 uppercase">Aprovado</div><div className="text-lg font-bold">{money(g.approvedAmount)}</div>{g.counterpartAmount !== null && <div className="text-xs text-slate-500">contrapartida {money(g.counterpartAmount)}</div>}</div>
        <div className="card"><div className="text-xs text-slate-500 uppercase">Recebido</div><div className="text-lg font-bold">{formatValue(received, "CURRENCY")}</div><div className="text-xs text-slate-500">parcelas marcadas como recebidas</div></div>
        <div className="card">
          <div className="text-xs text-slate-500 uppercase">Datas</div>
          <div className="text-xs leading-5 text-slate-700">
            {g.submissionDeadline && <div>Submissão: {formatShortDay(g.submissionDeadline)}</div>}
            {g.resultExpected && <div>Resultado: {formatShortDay(g.resultExpected)}</div>}
            {(g.executionStart || g.executionEnd) && <div>Execução: {g.executionStart ? formatShortDay(g.executionStart) : "?"} a {g.executionEnd ? formatShortDay(g.executionEnd) : "?"}</div>}
            {!g.submissionDeadline && !g.resultExpected && !g.executionStart && !g.executionEnd && "—"}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Etapa">
          <ActionForm action={changeGrantStatus} className="space-y-3">
            <input type="hidden" name="id" value={g.id} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="label">Nova etapa</label>
                <select name="status" defaultValue={g.status} className="input">
                  {GRANT_STATUSES.map((s) => (
                    <option key={s} value={s}>{GRANT_STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Desde quando</label>
                <input type="date" name="day" defaultValue={today} max={today} className="input" />
              </div>
              <div>
                <label className="label">Valor aprovado (R$)</label>
                <input name="approvedAmount" inputMode="decimal" placeholder="se aprovado" className="input" />
              </div>
            </div>
            <p className="hint">A data conta nos indicadores (ex.: “editais submetidos no mês”). Pode registrar com data passada.</p>
            <SubmitButton className="btn-primary btn-sm">Atualizar etapa</SubmitButton>
          </ActionForm>
          <h3 className="mt-4 mb-2 text-sm font-semibold text-slate-700">Histórico</h3>
          <ol className="space-y-1 text-sm">
            {[...g.changes].reverse().map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-xs text-slate-500">{formatShortDay(c.day)}</span>
                <Badge tone={GRANT_STATUS_TONE[c.toStatus]}>{GRANT_STATUS_LABEL[c.toStatus]}</Badge>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Metas, relatórios e parcelas">
          {g.items.length === 0 ? (
            <Empty>Nenhum item ainda. Cadastre as metas do projeto, os relatórios e as parcelas a receber.</Empty>
          ) : (
            <div className="space-y-4">
              {GRANT_ITEM_KINDS.map((k) => {
                const list = g.items.filter((i) => i.kind === k);
                if (!list.length) return null;
                return (
                  <div key={k}>
                    <h3 className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{GRANT_ITEM_LABEL[k]}</h3>
                    <ul className="divide-y divide-slate-100">
                      {list.map((i) => {
                        const late = !i.done && i.dueDate && i.dueDate < today;
                        return (
                          <li key={i.id} className="flex items-start justify-between gap-2 py-2">
                            <div className="flex min-w-0 items-start gap-2">
                              <ActionForm action={toggleGrantItem} className="">
                                <input type="hidden" name="id" value={i.id} />
                                <SubmitButton className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded border text-xs ${i.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white"}`} pendingText="…">
                                  {i.done ? "✓" : ""}
                                </SubmitButton>
                              </ActionForm>
                              <div className="min-w-0">
                                <div className={`text-sm ${i.done ? "text-slate-400 line-through" : ""}`}>{i.title}</div>
                                <div className="text-xs text-slate-500">
                                  {i.dueDate && <span className={late ? "font-semibold text-red-700" : ""}>{late ? "atrasado · " : ""}{formatShortDay(i.dueDate)}</span>}
                                  {i.assignee && ` · ${i.assignee.name}`}
                                  {i.amount !== null && ` · ${formatValue(i.amount, "CURRENCY")}`}
                                  {i.task && <> · <Link href={`/tarefas?pessoa=${i.assigneeId}`} className="link">tarefa no Chibata</Link></>}
                                </div>
                              </div>
                            </div>
                            <ActionForm action={deleteGrantItem} className="" confirm="Excluir este item?">
                              <input type="hidden" name="id" value={i.id} />
                              <SubmitButton className="text-xs text-slate-400 hover:text-red-700" pendingText="…">excluir</SubmitButton>
                            </ActionForm>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
          <details className="mt-4 rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">+ Adicionar item</summary>
            <ActionForm action={addGrantItem} resetOnSuccess className="mt-3 space-y-3">
              <input type="hidden" name="grantId" value={g.id} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Tipo</label>
                  <select name="kind" defaultValue="DELIVERABLE" className="input">
                    {GRANT_ITEM_KINDS.map((k) => (
                      <option key={k} value={k}>{GRANT_ITEM_LABEL[k]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Prazo</label>
                  <input type="date" name="dueDate" className="input" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Descrição</label>
                  <input name="title" required placeholder="ex.: Protótipo validado em laboratório · Relatório técnico parcial · 1ª parcela" className="input" />
                </div>
                <div>
                  <label className="label">Responsável</label>
                  <select name="assigneeId" defaultValue="" className="input">
                    <option value="">—</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Valor (R$, para parcelas)</label>
                  <input name="amount" inputMode="decimal" className="input" />
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="createTask" className="mt-0.5 h-4 w-4" />
                <span>Criar também uma tarefa para o responsável (aparece em Tarefas e conta no desempenho dele)</span>
              </label>
              <SubmitButton className="btn-primary btn-sm">Adicionar</SubmitButton>
            </ActionForm>
          </details>
        </Card>
      </div>

      <Card title="Dados do edital">
        <GrantForm g={g.raw} people={people} />
      </Card>

      {access.isAdmin && (
        <ActionForm action={deleteGrant} className="" confirm="Excluir este edital, seus itens e o histórico? As tarefas abertas criadas a partir dele também serão excluídas.">
          <input type="hidden" name="id" value={g.id} />
          <SubmitButton className="btn-danger btn-sm" pendingText="Excluindo…">Excluir edital</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
