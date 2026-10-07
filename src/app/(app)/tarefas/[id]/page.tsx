import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { FeedbackForm } from "@/components/FeedbackForm";
import { FeedbackList } from "@/components/FeedbackList";
import { TaskForm } from "@/components/TaskForm";
import { TaskList } from "@/components/TaskList";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { deleteTask, setTaskStatus, updateTask } from "@/app/actions/tasks";
import { requireAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { canDeleteTask, canEditTask, canGiveFeedback, canViewUser } from "@/lib/domain/access";
import { dateToKey, todayKey } from "@/lib/domain/dates";
import { formatDateTime, STATUS_LABEL } from "@/lib/format";
import { taskFormOptions } from "@/lib/services/tasks";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireAccess();
  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      project: true,
      parent: { select: { id: true, title: true } },
      children: { include: { assignee: { select: { id: true, name: true } }, project: { select: { name: true, kind: true } } }, orderBy: { dueDate: "asc" } },
      feedbacks: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  // 404 também quando não há permissão, para não revelar a existência do registro
  if (!task || !canViewUser(access.ctx, task.assigneeId)) notFound();
  const editable = canEditTask(access.ctx, task);
  const today = todayKey();
  const options = editable ? await taskFormOptions(access) : null;
  const done = task.children.filter((c) => c.status === "DONE").length;
  const overdue = !!task.dueDate && dateToKey(task.dueDate) < today && task.status !== "DONE";

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={`${task.kind === "GOAL" ? "Meta" : "Tarefa"}: ${task.title}`}
        subtitle={
          <>
            {task.assignee.name} · {task.asanaGid ? "importada do Asana, criada lá" : `criada por ${task.createdBy.name}`} em {formatDateTime(task.createdAt)}
            {task.parent && (
              <>
                {" "}· parte da meta <Link className="link" href={`/tarefas/${task.parent.id}`}>{task.parent.title}</Link>
              </>
            )}
          </>
        }
        actions={
          <>
            <StatusBadge status={task.status} overdue={overdue} />
            {task.asanaUrl && (
              <a href={task.asanaUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
                Abrir no Asana ↗
              </a>
            )}
          </>
        }
      />

      {editable && (
        <div className="flex flex-wrap gap-2">
          {(["TODO", "IN_PROGRESS", "DONE"] as const)
            .filter((s) => s !== task.status)
            .map((s) => (
              <ActionForm key={s} action={setTaskStatus} className="">
                <input type="hidden" name="id" value={task.id} />
                <input type="hidden" name="status" value={s} />
                <SubmitButton className="btn-secondary btn-sm" pendingText="…">Marcar como {STATUS_LABEL[s].toLowerCase()}</SubmitButton>
              </ActionForm>
            ))}
        </div>
      )}

      {task.kind === "GOAL" && (
        <Card title={`Tarefas desta meta (${done}/${task.children.length} concluídas)`}>
          <TaskList tasks={task.children} today={today} />
        </Card>
      )}

      {task.asanaGid && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 text-sm text-slate-700">
          Tarefa sincronizada do Asana{task.asanaSyncedAt ? ` (atualizada ${formatDateTime(task.asanaSyncedAt)})` : ""}. Título, prazo e responsável são editados no Asana; concluir ou
          reabrir aqui também conclui ou reabre lá.
          {task.asanaFields && Object.keys(task.asanaFields as object).length > 0 && (
            <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              {Object.entries(task.asanaFields as Record<string, string | number | null>)
                .filter(([, v]) => v !== null && v !== "")
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="inline text-slate-500">{k}: </dt>
                    <dd className="inline">{String(v)}</dd>
                  </div>
                ))}
            </dl>
          )}
        </div>
      )}

      {editable && options && !task.asanaGid ? (
        <Card title="Editar">
          <TaskForm
            action={updateTask}
            options={options}
            submitLabel="Salvar alterações"
            values={{
              id: task.id,
              kind: task.kind,
              title: task.title,
              description: task.description,
              assigneeId: task.assigneeId,
              dueDate: task.dueDate ? dateToKey(task.dueDate) : null,
              status: task.status,
              blockedReason: task.blockedReason,
              projectId: task.projectId,
              parentId: task.parentId,
            }}
          />
        </Card>
      ) : (
        task.description && <Card title="Descrição"><p className="text-sm whitespace-pre-wrap">{task.description}</p></Card>
      )}

      <Card title="Feedbacks sobre esta tarefa">
        {canGiveFeedback(access.ctx, task.assigneeId) && (
          <div className="mb-4">
            <FeedbackForm targetUserId={task.assigneeId} taskId={task.id} compact />
          </div>
        )}
        <FeedbackList items={task.feedbacks} />
      </Card>

      {canDeleteTask(access.ctx, task) && !task.asanaGid && (
        <ActionForm action={deleteTask} confirm="Excluir esta tarefa? A ação fica registrada na auditoria.">
          <input type="hidden" name="id" value={task.id} />
          <SubmitButton className="btn-danger btn-sm" pendingText="Excluindo…">Excluir</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
