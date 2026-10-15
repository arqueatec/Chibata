import "server-only";
import { asanaConfigured, asanaPost, asanaPut } from "./client";

/** Conclui ou reabre a tarefa no Asana (app → Asana). */
export async function setAsanaCompleted(asanaGid: string, completed: boolean) {
  if (!asanaConfigured()) return;
  await asanaPut(`/tasks/${asanaGid}`, { completed });
}

/** Cria no Asana uma tarefa já concluída (demanda extra registrada no check-in). */
export async function createAsanaCompletedTask(opts: { name: string; projectGid: string; assigneeEmail: string; notes?: string }) {
  const t = await asanaPost<{ gid: string; permalink_url?: string }>("/tasks", {
    name: opts.name,
    projects: [opts.projectGid],
    assignee: opts.assigneeEmail,
    completed: true,
    notes: opts.notes ?? "",
  });
  return { gid: t.gid, url: t.permalink_url ?? null };
}
