import Link from "next/link";
import { dateToKey, formatDay } from "@/lib/domain/dates";
import { Badge, Empty, StatusBadge } from "./ui";

export interface TaskRow {
  id: string;
  kind: string;
  title: string;
  status: string;
  dueDate: Date | null;
  blockedReason: string | null;
  assignee: { id: string; name: string };
  project: { name: string; kind: string } | null;
  _count?: { children: number };
  childrenDone?: number;
  asanaGid?: string | null;
}

export function TaskList({ tasks, today, showAssignee = true }: { tasks: TaskRow[]; today: string; showAssignee?: boolean }) {
  if (tasks.length === 0) return <Empty>Nenhuma tarefa aqui.</Empty>;
  return (
    <ul className="divide-y divide-slate-100">
      {tasks.map((t) => {
        const due = t.dueDate ? dateToKey(t.dueDate) : null;
        const overdue = !!due && due < today && t.status !== "DONE";
        return (
          <li key={t.id} className={`py-2.5 ${overdue || t.status === "BLOCKED" ? "border-l-4 border-l-red-400 pl-2" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/tarefas/${t.id}`} className="font-medium text-slate-900 hover:underline">
                  {t.kind === "GOAL" && <span className="mr-1 text-brand-700">◎ Meta:</span>}
                  {t.title}
                </Link>
                {t.asanaGid && <span className="ml-1 rounded bg-rose-50 px-1 text-[10px] font-semibold text-rose-700" title="Sincronizada do Asana">Asana</span>}
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                  {showAssignee && <span>{t.assignee.name}</span>}
                  {due && <span className={overdue ? "font-semibold text-red-700" : ""}>prazo {formatDay(due)}</span>}
                  {t.project && <span>{t.project.kind === "CLIENT" ? "cliente" : "projeto"}: {t.project.name}</span>}
                  {t._count && t._count.children > 0 && <span>{t.childrenDone ?? 0}/{t._count.children} tarefas concluídas</span>}
                </div>
                {t.status === "BLOCKED" && t.blockedReason && <p className="mt-1 text-xs text-red-700">⚠ {t.blockedReason}</p>}
              </div>
              <StatusBadge status={t.status} overdue={overdue} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export { Badge };
