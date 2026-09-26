import { formatDateTime, ACTION_LABEL, ENTITY_LABEL } from "@/lib/format";
import { Badge, Empty } from "./ui";

export interface AuditRow {
  id: string;
  createdAt: Date;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  actor: { name: string } | null;
  subjectUser?: { name: string } | null;
}

function show(v: unknown) {
  if (v === null || v === undefined) return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 140 ? `${s.slice(0, 140)}…` : s;
}

/** Mostra quem fez, quando, valor anterior e novo. */
export function AuditList({ items, showSubject = false }: { items: AuditRow[]; showSubject?: boolean }) {
  if (items.length === 0) return <Empty>Nenhum registro.</Empty>;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {items.map((a) => {
        const before = (a.before ?? {}) as Record<string, unknown>;
        const after = (a.after ?? {}) as Record<string, unknown>;
        const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
        return (
          <li key={a.id} className="py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Badge tone={a.action === "DELETE" ? "red" : a.action === "REOPEN" ? "yellow" : a.action === "CREATE" ? "green" : "gray"}>{ACTION_LABEL[a.action] ?? a.action}</Badge>
              <span className="font-medium text-slate-700">{ENTITY_LABEL[a.entityType] ?? a.entityType}</span>
              {showSubject && a.subjectUser && <span>sobre {a.subjectUser.name}</span>}
              <span>por {a.actor?.name ?? "sistema"} · {formatDateTime(a.createdAt)}</span>
            </div>
            {a.reason && <p className="mt-1 text-xs"><strong>Justificativa:</strong> {a.reason}</p>}
            {keys.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-brand-700">ver valores</summary>
                <div className="mt-1 overflow-x-auto">
                  <table className="tbl text-xs">
                    <thead>
                      <tr><th>Campo</th><th>Anterior</th><th>Novo</th></tr>
                    </thead>
                    <tbody>
                      {keys.map((k) => (
                        <tr key={k}>
                          <td className="font-mono">{k}</td>
                          <td className="break-all text-slate-500">{show(before[k])}</td>
                          <td className="break-all">{show(after[k])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
