import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Badge } from "@/components/ui";
import { contestTask, setRequiresEvidence, setTaskEvidence, withdrawContest } from "@/app/actions/tasks";
import { hasEvidence, notCountingReason } from "@/lib/domain/deliveries";

export interface DeliveryTask {
  id: string;
  title: string;
  status: string;
  unplanned: boolean;
  requiresEvidence: boolean;
  evidenceUrl: string | null;
  asanaAttachments: number;
  asanaUrl: string | null;
  contestedAt: Date | null;
  contestReason: string | null;
}

/** Selos de uma entrega: demanda extra, evidência, contestação. */
export function DeliveryBadges({ t }: { t: DeliveryTask }) {
  const why = notCountingReason(t);
  return (
    <>
      {t.unplanned && <Badge tone="yellow">demanda extra</Badge>}
      {hasEvidence(t) ? <Badge tone="green">📎 com evidência</Badge> : t.requiresEvidence ? <Badge tone="yellow">exige evidência</Badge> : null}
      {why && <Badge tone="red">não conta: {why}</Badge>}
    </>
  );
}

/**
 * Evidência e contestação de uma tarefa.
 * canEdit: a pessoa (ou quem edita a tarefa) pode colar o link; leader: líder/admin pode exigir evidência e contestar.
 */
export function DeliveryControls({ t, canEdit, leader, canContestNow }: { t: DeliveryTask; canEdit: boolean; leader: boolean; canContestNow: boolean }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <DeliveryBadges t={t} />
        {t.evidenceUrl && (
          <a href={t.evidenceUrl} target="_blank" rel="noopener noreferrer" className="link text-xs">abrir evidência ↗</a>
        )}
        {t.asanaAttachments > 0 && t.asanaUrl && (
          <a href={t.asanaUrl} target="_blank" rel="noopener noreferrer" className="link text-xs">{t.asanaAttachments} anexo(s) no Asana ↗</a>
        )}
      </div>
      {t.contestedAt && <p className="rounded bg-red-50 p-2 text-xs text-red-800">Contestada pelo líder: {t.contestReason}</p>}
      {canEdit && (
        <ActionForm action={setTaskEvidence} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={t.id} />
          <input name="evidenceUrl" type="url" defaultValue={t.evidenceUrl ?? ""} placeholder="Link da evidência (Drive, foto, documento…)" className="input !w-auto min-w-56 flex-1 !py-1 text-xs" />
          <SubmitButton className="btn-secondary btn-sm" pendingText="…">Salvar evidência</SubmitButton>
        </ActionForm>
      )}
      {leader && (
        <div className="flex flex-wrap items-start gap-2">
          <ActionForm action={setRequiresEvidence} className="">
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="value" value={t.requiresEvidence ? "0" : "1"} />
            <SubmitButton className="btn-secondary btn-sm" pendingText="…">{t.requiresEvidence ? "Não exigir evidência" : "Exigir evidência"}</SubmitButton>
          </ActionForm>
          {t.status === "DONE" &&
            (t.contestedAt ? (
              <ActionForm action={withdrawContest} className="">
                <input type="hidden" name="id" value={t.id} />
                <SubmitButton className="btn-secondary btn-sm" pendingText="…">Retirar contestação</SubmitButton>
              </ActionForm>
            ) : (
              canContestNow && (
                <details className="rounded-lg border border-slate-200 px-2 py-1">
                  <summary className="cursor-pointer text-xs font-medium text-red-700">Contestar entrega</summary>
                  <ActionForm action={contestTask} className="mt-2 space-y-2">
                    <input type="hidden" name="id" value={t.id} />
                    <textarea name="reason" required maxLength={500} rows={2} placeholder="Por que esta entrega não deve contar? (ex.: falta a evidência, não foi concluída)" className="input text-xs" />
                    <SubmitButton className="btn-danger btn-sm" pendingText="…">Contestar</SubmitButton>
                  </ActionForm>
                </details>
              )
            ))}
        </div>
      )}
    </div>
  );
}
