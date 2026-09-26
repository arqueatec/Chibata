import Link from "next/link";
import { dateToKey, formatDay } from "@/lib/domain/dates";
import { formatDateTime } from "@/lib/format";
import { Badge, Empty } from "./ui";

export interface FeedbackRow {
  id: string;
  kind: string;
  body: string;
  createdAt: Date;
  author: { name: string };
  checkIn?: { date: Date } | null;
  task?: { id: string; title: string } | null;
  periodType?: string | null;
  periodStart?: Date | null;
}

export function FeedbackList({ items }: { items: FeedbackRow[] }) {
  if (items.length === 0) return <Empty>Nenhum feedback registrado.</Empty>;
  return (
    <ul className="space-y-3">
      {items.map((f) => (
        <li key={f.id} className={`rounded-lg border p-3 ${f.kind === "RECOGNITION" ? "border-amber-200 bg-amber-50/50" : "border-slate-200"}`}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge tone={f.kind === "RECOGNITION" ? "yellow" : "gray"}>{f.kind === "RECOGNITION" ? "⭐ Reconhecimento" : "Comentário"}</Badge>
            <span>{f.author.name} · {formatDateTime(f.createdAt)}</span>
            {f.checkIn && <span>sobre o dia {formatDay(dateToKey(f.checkIn.date))}</span>}
            {f.task && (
              <span>
                sobre <Link className="link" href={`/tarefas/${f.task.id}`}>{f.task.title}</Link>
              </span>
            )}
            {f.periodType && f.periodStart && (
              <span>sobre {f.periodType === "WEEK" ? "a semana de" : "o mês de"} {formatDay(dateToKey(f.periodStart))}</span>
            )}
          </div>
          <p className="text-sm whitespace-pre-wrap text-slate-800">{f.body}</p>
        </li>
      ))}
    </ul>
  );
}
