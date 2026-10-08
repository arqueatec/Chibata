import { ActionForm, SubmitButton } from "./ActionForm";
import { deleteIndicator, saveIndicator } from "@/app/actions/admin";
import { AUTO_RULE_TYPES, parseAutoRule } from "@/lib/domain/autoIndicators";

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
  autoRule?: unknown;
}

export function IndicatorForm({
  values,
  areas,
  people,
  fixedOwner,
  projects = [],
}: {
  values: IndicatorValues;
  areas?: { id: string; name: string }[];
  people?: { id: string; name: string }[];
  fixedOwner?: string;
  projects?: { id: string; name: string; fromAsana?: boolean }[];
}) {
  const rule = parseAutoRule(values.autoRule);
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
        <details className="rounded-lg border border-slate-200 p-3" open={!!rule}>
          <summary className="cursor-pointer text-sm font-medium">Preenchimento: {rule ? <span className="text-accent-700">automático</span> : "manual no check-in"}</summary>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Regra</label>
              <select name="autoType" defaultValue={rule?.type ?? ""} className="input">
                <option value="">Manual (a pessoa informa no check-in)</option>
                {Object.entries(AUTO_RULE_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>Automático: {v}</option>
                ))}
              </select>
              <p className="hint">Contado nas tarefas do responsável (sincronizadas do Asana ou criadas no app). Indicadores automáticos não são editados no check-in.</p>
            </div>
            <div>
              <label className="label">Só tarefas cujo título contém</label>
              <input name="autoName" defaultValue={rule?.nameContains ?? ""} placeholder="ex.: Ata" className="input" />
            </div>
            <div>
              <label className="label">Campo do Asana</label>
              <input name="autoField" defaultValue={rule?.field ?? ""} placeholder="ex.: Valor estimado, Status do lead" className="input" />
            </div>
            <div>
              <label className="label">Valor do campo (para “mudou para”)</label>
              <input name="autoValue" defaultValue={rule?.value ?? ""} placeholder="ex.: Reunião" className="input" />
            </div>
            {projects.length > 0 && (
              <fieldset className="sm:col-span-2">
                <legend className="label">Só nestes projetos (nenhum marcado = todos)</legend>
                <div className="grid gap-1 sm:grid-cols-2">
                  {projects.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="autoProjects" value={p.id} defaultChecked={rule?.projectIds.includes(p.id)} className="h-4 w-4" />
                      {p.name}
                      {p.fromAsana && <span className="text-xs text-slate-400">(Asana)</span>}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        </details>
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
