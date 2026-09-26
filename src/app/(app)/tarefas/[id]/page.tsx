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
            {task.assignee.name} · criada por {task.createdBy.name} em {formatDateTime(task.createdAt)}
            {task.parent && (
              <>
                {" "}· parte da meta <Link className="link" href={`/tarefas/${task.parent.id}`}>{task.parent.title}</Link>
              </>
            )}
          </>
        }
        actions={<StatusBadge status={task.status} overdue={overdue} />}
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

      {editable && options ? (
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

      {canDeleteTask(access.ctx, task) && (
        <ActionForm action={deleteTask} confirm="Excluir esta tarefa? A ação fica registrada na auditoria.">
          <input type="hidden" name="id" value={task.id} />
          <SubmitButton className="btn-danger btn-sm" pendingText="Excluindo…">Excluir</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
