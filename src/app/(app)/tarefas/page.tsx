import Link from "next/link";
import type { Prisma, TaskStatus } from "@prisma/client";
import { Card, PageHeader } from "@/components/ui";
import { TaskForm } from "@/components/TaskForm";
import { TaskList } from "@/components/TaskList";
import { createTask } from "@/app/actions/tasks";
import { requireAccess, visibleWhere } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { keyToDate, todayKey } from "@/lib/domain/dates";
import { STATUS_LABEL } from "@/lib/format";
import { taskFormOptions } from "@/lib/services/tasks";

export const metadata = { title: "Metas e tarefas" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ pessoa?: string; status?: string; projeto?: string; tipo?: string }> }) {
  const access = await requireAccess();
  const sp = await searchParams;
  const today = todayKey();
  const visible = visibleWhere(access);
  const personFilter = sp.pessoa && (!access.visible || access.visible.has(sp.pessoa)) ? sp.pessoa : undefined;

  const where: Prisma.TaskWhereInput = {
    assigneeId: personFilter ?? visible,
    ...(sp.status && sp.status in STATUS_LABEL ? { status: sp.status as TaskStatus } : sp.status === "todas" ? {} : { status: { not: "DONE" } }),
    ...(sp.projeto ? { projectId: sp.projeto } : {}),
    ...(sp.tipo === "GOAL" || sp.tipo === "TASK" ? { kind: sp.tipo } : {}),
  };
  const include = { assignee: { select: { id: true, name: true } }, project: { select: { name: true, kind: true } }, _count: { select: { children: true } } } as const;

  const [tasks, attention, options, projects, visiblePeople] = await Promise.all([
    prisma.task.findMany({ where, include, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 300 }),
    prisma.task.findMany({
      where: { assigneeId: personFilter ?? visible, status: { not: "DONE" }, OR: [{ status: "BLOCKED" }, { dueDate: { lt: keyToDate(today) } }] },
      include,
      orderBy: { dueDate: "asc" },
    }),
    taskFormOptions(access),
    prisma.project.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { id: visible }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const goalIds = tasks.filter((t) => t.kind === "GOAL").map((t) => t.id);
  const doneCounts = goalIds.length
    ? await prisma.task.groupBy({ by: ["parentId"], where: { parentId: { in: goalIds }, status: "DONE" }, _count: true })
    : [];
  const withProgress = tasks.map((t) => ({ ...t, childrenDone: doneCounts.find((d) => d.parentId === t.id)?._count ?? 0 }));
  const showAssignee = access.visible === null || access.visible.size > 1;

  return (
    <div className="space-y-4">
      <PageHeader title="Metas e tarefas" subtitle="Tarefas atrasadas e bloqueadas aparecem em destaque." />

      {attention.length > 0 && (
        <Card title={<span className="text-red-800">⚠ Precisam de atenção ({attention.length})</span>} className="border-red-200 bg-red-50/40">
          <TaskList tasks={attention} today={today} showAssignee={showAssignee} />
        </Card>
      )}

      <details className="card">
        <summary className="cursor-pointer text-base font-semibold text-slate-800">+ Nova meta ou tarefa</summary>
        <div className="mt-4">
          <TaskForm
            action={createTask}
            options={options}
            submitLabel="Criar"
            values={{ kind: "TASK", title: "", description: null, assigneeId: personFilter ?? access.user.id, dueDate: null, status: "TODO", blockedReason: null, projectId: null, parentId: null }}
          />
        </div>
      </details>

      <Card>
        <form className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5" action="/tarefas">
          {showAssignee && (
            <select name="pessoa" defaultValue={personFilter ?? ""} className="input" aria-label="Pessoa">
              <option value="">Todas as pessoas</option>
              {visiblePeople.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          <select name="status" defaultValue={sp.status ?? ""} className="input" aria-label="Status">
            <option value="">Abertas</option>
            <option value="todas">Todas</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select name="tipo" defaultValue={sp.tipo ?? ""} className="input" aria-label="Tipo">
            <option value="">Metas e tarefas</option>
            <option value="GOAL">Só metas</option>
            <option value="TASK">Só tarefas</option>
          </select>
          <select name="projeto" defaultValue={sp.projeto ?? ""} className="input" aria-label="Projeto ou cliente">
            <option value="">Todos os projetos/clientes</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1" type="submit">Filtrar</button>
            <Link href="/tarefas" className="btn-secondary">Limpar</Link>
          </div>
        </form>
        <TaskList tasks={withProgress} today={today} showAssignee={showAssignee} />
      </Card>
    </div>
  );
}
