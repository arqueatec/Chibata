import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { createGrant, updateGrant } from "@/app/actions/grants";
import { dateToKey } from "@/lib/domain/dates";
import { GRANT_STATUS_LABEL, GRANT_STATUSES } from "@/lib/domain/grants";

export interface GrantFormValues {
  id?: string;
  title: string;
  funder: string;
  callName: string | null;
  url: string | null;
  ownerId: string;
  requestedAmount: number | null;
  approvedAmount: number | null;
  counterpartAmount: number | null;
  submissionDeadline: Date | null;
  resultExpected: Date | null;
  executionStart: Date | null;
  executionEnd: Date | null;
  notes: string | null;
}

const d = (v: Date | null) => (v ? dateToKey(v) : "");
const n = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

/** Cadastro/edição dos dados de um edital. A etapa é alterada à parte (com data), exceto na criação. */
export function GrantForm({ g, people }: { g: GrantFormValues; people: { id: string; name: string }[] }) {
  return (
    <ActionForm action={g.id ? updateGrant : createGrant} className="space-y-3">
      {g.id && <input type="hidden" name="id" value={g.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Título do projeto / edital</label>
          <input name="title" required defaultValue={g.title} placeholder="ex.: Centelha 3 – extintor ecológico" className="input" />
        </div>
        <div>
          <label className="label">Órgão de fomento</label>
          <input name="funder" required defaultValue={g.funder} placeholder="ex.: FACEPE, FINEP, CNPq, SEBRAE" className="input" />
        </div>
        <div>
          <label className="label">Chamada (número/nome)</label>
          <input name="callName" defaultValue={g.callName ?? ""} placeholder="ex.: Edital 12/2026" className="input" />
        </div>
        <div>
          <label className="label">Responsável</label>
          <select name="ownerId" defaultValue={g.ownerId} className="input">
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        {!g.id ? (
          <div>
            <label className="label">Etapa atual</label>
            <select name="status" defaultValue="PROSPECT" className="input">
              {GRANT_STATUSES.map((s) => (
                <option key={s} value={s}>{GRANT_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="label">Link do edital</label>
            <input name="url" type="url" defaultValue={g.url ?? ""} placeholder="https://…" className="input" />
          </div>
        )}
        {!g.id && (
          <div className="sm:col-span-2">
            <label className="label">Link do edital</label>
            <input name="url" type="url" defaultValue={g.url ?? ""} placeholder="https://…" className="input" />
          </div>
        )}
        <div>
          <label className="label">Valor solicitado (R$)</label>
          <input name="requestedAmount" inputMode="decimal" defaultValue={n(g.requestedAmount)} className="input" />
        </div>
        <div>
          <label className="label">Contrapartida (R$)</label>
          <input name="counterpartAmount" inputMode="decimal" defaultValue={n(g.counterpartAmount)} className="input" />
        </div>
        {g.id && (
          <div>
            <label className="label">Valor aprovado (R$)</label>
            <input name="approvedAmount" inputMode="decimal" defaultValue={n(g.approvedAmount)} className="input" />
          </div>
        )}
        <div>
          <label className="label">Prazo de submissão</label>
          <input name="submissionDeadline" type="date" defaultValue={d(g.submissionDeadline)} className="input" />
        </div>
        <div>
          <label className="label">Resultado previsto</label>
          <input name="resultExpected" type="date" defaultValue={d(g.resultExpected)} className="input" />
        </div>
        <div>
          <label className="label">Início da execução</label>
          <input name="executionStart" type="date" defaultValue={d(g.executionStart)} className="input" />
        </div>
        <div>
          <label className="label">Fim da execução</label>
          <input name="executionEnd" type="date" defaultValue={d(g.executionEnd)} className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Observações</label>
          <textarea name="notes" rows={3} defaultValue={g.notes ?? ""} className="input" />
        </div>
      </div>
      <SubmitButton>{g.id ? "Salvar dados" : "Cadastrar edital"}</SubmitButton>
    </ActionForm>
  );
}
