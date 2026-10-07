import "server-only";
import { asanaConfigured, asanaPut } from "./client";

/** Conclui ou reabre a tarefa no Asana (app → Asana). */
export async function setAsanaCompleted(asanaGid: string, completed: boolean) {
  if (!asanaConfigured()) return;
  await asanaPut(`/tasks/${asanaGid}`, { completed });
}
