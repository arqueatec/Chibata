import { ActionForm, SubmitButton, type ActionResult } from "./ActionForm";
import { STATUS_LABEL } from "@/lib/format";

export interface TaskFormOptions {
  people: { id: string; name: string }[];
  projects: { id: string; name: string; kind: string }[];
  goals: { id: string; title: string }[];
}

export interface TaskValues {
  id?: string;
  kind: string;
  title: string;
  description: string | null;
  assigneeId: string;
  dueDate: string | null;
  status: string;
  blockedReason: string | null;
  projectId: string | null;
  parentId: string | null;
}

export function TaskForm({
  action,
  options,
  values,
  submitLabel,
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  options: TaskFormOptions;
  values: TaskValues;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} resetOnSuccess={!values.id}>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="title">Título</label>
          <input id="title" name="title" required maxLength={200} defaultValue={values.title} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="kind">Tipo</label>
          <select id="kind" name="kind" defaultValue={values.kind} className="input">
            <option value="TASK">Tarefa</option>
            <option value="GOAL">Meta</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="assigneeId">Responsável</label>
          <select id="assigneeId" name="assigneeId" defaultValue={values.assigneeId} className="input">
            {options.people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dueDate">Prazo</label>
          <input id="dueDate" name="dueDate" type="date" defaultValue={values.dueDate ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={values.status} className="input">
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="blockedReason">Motivo do bloqueio <span className="font-normal text-slate-400">(obrigatório se bloqueada)</span></label>
          <input id="blockedReason" name="blockedReason" maxLength={1000} defaultValue={values.blockedReason ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="projectId">Projeto ou cliente</label>
          <select id="projectId" name="projectId" defaultValue={values.projectId ?? ""} className="input">
            <option value="">— nenhum —</option>
            {options.projects.map((p) => (
              <option key={p.id} value={p.id}>{p.kind === "CLIENT" ? "Cliente: " : "Projeto: "}{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="parentId">Vinculada à meta</label>
          <select id="parentId" name="parentId" defaultValue={values.parentId ?? ""} className="input">
            <option value="">— nenhuma —</option>
            {options.goals.filter((g) => g.id !== values.id).map((g) => (
              <option key={g.id} value={g.id}>{g.title}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">Descrição</label>
          <textarea id="description" name="description" rows={3} maxLength={4000} defaultValue={values.description ?? ""} className="input" />
        </div>
      </div>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
