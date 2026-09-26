import { ActionForm, SubmitButton } from "./ActionForm";
import { deleteIndicator, saveIndicator } from "@/app/actions/admin";

export interface IndicatorValues {
  id?: string;
  name: string;
  description: string | null;
  unit: string;
  direction: string;
  aggregation: string;
  targetValue: number;
  targetPeriod: string;
  weight: number;
  sortOrder: number;
  active: boolean;
  areaId: string | null;
  ownerId: string | null;
}

export function IndicatorForm({
  values,
  areas,
  people,
  fixedOwner,
}: {
  values: IndicatorValues;
  areas?: { id: string; name: string }[];
  people?: { id: string; name: string }[];
  fixedOwner?: string;
}) {
  const scope = fixedOwner ? `owner:${fixedOwner}` : values.ownerId ? `owner:${values.ownerId}` : values.areaId ? `area:${values.areaId}` : "";
  return (
    <div className="space-y-2">
      <ActionForm action={saveIndicator} resetOnSuccess={!values.id} className="space-y-3">
        {values.id && <input type="hidden" name="id" value={values.id} />}
        {fixedOwner ? (
          <input type="hidden" name="ownerId" value={fixedOwner} />
        ) : (
          <ScopeSelect scope={scope} areas={areas ?? []} people={people ?? []} />
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2">
            <label className="label">Nome</label>
            <input name="name" required maxLength={120} defaultValue={values.name} className="input" />
          </div>
          <div>
            <label className="label">Meta</label>
            <input name="targetValue" required inputMode="decimal" defaultValue={values.targetValue} className="input" />
          </div>
          <div>
            <label className="label">Período da meta</label>
            <select name="targetPeriod" defaultValue={values.targetPeriod} className="input">
              <option value="DAILY">Diária</option>
              <option value="WEEKLY">Semanal</option>
              <option value="MONTHLY">Mensal</option>
            </select>
          </div>
          <div>
            <label className="label">Peso</label>
            <input name="weight" required inputMode="decimal" defaultValue={values.weight} className="input" />
          </div>
          <div>
            <label className="label">Unidade</label>
            <select name="unit" defaultValue={values.unit} className="input">
              <option value="COUNT">Quantidade</option>
              <option value="CURRENCY">Valor (R$)</option>
              <option value="PERCENT">Percentual</option>
              <option value="HOURS">Horas</option>
            </select>
          </div>
          <div>
            <label className="label">Sentido</label>
            <select name="direction" defaultValue={values.direction} className="input">
              <option value="HIGHER_BETTER">Maior é melhor</option>
              <option value="LOWER_BETTER">Menor é melhor (meta = máximo)</option>
            </select>
          </div>
          <div>
            <label className="label">Consolidação</label>
            <select name="aggregation" defaultValue={values.aggregation} className="input">
              <option value="SUM">Soma dos dias</option>
              <option value="LAST">Último valor (estoque)</option>
            </select>
          </div>
          <div>
            <label className="label">Ordem</label>
            <input name="sortOrder" inputMode="numeric" defaultValue={values.sortOrder} className="input" />
          </div>
          <div className="col-span-2 sm:col-span-3">
            <label className="label">Descrição</label>
            <input name="description" maxLength={500} defaultValue={values.description ?? ""} className="input" />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={values.active} className="h-5 w-5" /> Ativo
          </label>
        </div>
        <SubmitButton className="btn-primary btn-sm">{values.id ? "Salvar indicador" : "Adicionar indicador"}</SubmitButton>
      </ActionForm>
      {values.id && (
        <ActionForm action={deleteIndicator} className="" confirm="Excluir este indicador? Se houver lançamentos, ele será apenas desativado.">
          <input type="hidden" name="id" value={values.id} />
          <SubmitButton className="btn-danger btn-sm" pendingText="…">Excluir/desativar</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

function ScopeSelect({ scope, areas, people }: { scope: string; areas: { id: string; name: string }[]; people: { id: string; name: string }[] }) {
  // O escopo é enviado como dois campos: areaId OU ownerId. Usamos dois selects simples e acessíveis.
  const [kind, id] = scope.split(":");
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Área</label>
        <select name="areaId" defaultValue={kind === "area" ? id : ""} className="input">
          <option value="">— indicador pessoal —</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">ou Pessoa (indicador pessoal)</label>
        <select name="ownerId" defaultValue={kind === "owner" ? id : ""} className="input">
          <option value="">— indicador de área —</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
