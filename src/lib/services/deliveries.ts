import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { todayKey, type DayKey } from "@/lib/domain/dates";
import { hasEvidence, normalizeEvidenceUrl } from "@/lib/domain/deliveries";
import { normalize } from "@/lib/domain/autoIndicators";
import { createAsanaCompletedTask, setAsanaCompleted } from "@/lib/asana/writeback";
import { asanaConfigured, AsanaError } from "@/lib/asana/client";
import { recomputeAutoIndicators } from "./autoIndicators";

/** Instante usado como conclusão de uma entrega registrada para um dia passado: meio-dia em Brasília. */
function completionInstant(day: DayKey, today: DayKey) {
  return day === today ? new Date() : new Date(`${day}T15:00:00.000Z`);
}

const asanaMsg = (e: unknown) => (e instanceof AsanaError ? e.message : "erro de conexão");

/**
 * Registra as entregas informadas no check-in: tarefas planejadas concluídas, links de evidência
 * e demandas extras (criadas já concluídas, marcadas como não planejadas e, se o projeto for do Asana, criadas lá também).
 */
export async function recordDeliveries(input: {
  actorId: string;
  userId: string;
  day: DayKey;
  today: DayKey;
  complete: string[];
  evidence: Record<string, string>;
  extras: { title: string; projectId: string; evidenceUrl: string }[];
}) {
  const warnings: string[] = [];
  let completed = 0;
  let extras = 0;
  let evidences = 0;
  const when = completionInstant(input.day, input.today);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId }, select: { email: true, asanaEmails: true } });

  const url = (raw: string | undefined, label: string) => {
    try {
      return normalizeEvidenceUrl(raw);
    } catch {
      warnings.push(`O link de evidência de “${label}” é inválido (use http:// ou https://) e não foi salvo.`);
      return undefined;
    }
  };

  // 1) Evidências e conclusões de tarefas existentes (só da própria pessoa)
  const ids = [...new Set([...input.complete, ...Object.keys(input.evidence)])];
  const tasks = ids.length ? await prisma.task.findMany({ where: { id: { in: ids }, assigneeId: input.userId } }) : [];
  for (const t of tasks) {
    const ev = t.id in input.evidence ? url(input.evidence[t.id], t.title) : undefined;
    const data: { evidenceUrl?: string | null; status?: "DONE"; completedAt?: Date; blockedReason?: null } = {};
    if (ev !== undefined && ev !== t.evidenceUrl) data.evidenceUrl = ev;
    if (input.complete.includes(t.id) && t.status !== "DONE") {
      let asanaOk = true;
      if (t.asanaGid && asanaConfigured()) {
        // Conclui no Asana primeiro: se o Asana recusar, a tarefa continua aberta aqui (senão a sincronização a reabriria)
        try {
          await setAsanaCompleted(t.asanaGid, true);
        } catch (e) {
          asanaOk = false;
          warnings.push(`“${t.title}” não foi concluída: o Asana recusou (${asanaMsg(e)}).`);
        }
      }
      if (asanaOk) Object.assign(data, { status: "DONE", completedAt: when, blockedReason: null });
    }
    if (Object.keys(data).length === 0) continue;
    await prisma.task.update({ where: { id: t.id }, data });
    await audit({ actorId: input.actorId, subjectUserId: input.userId, entityType: "Task", entityId: t.id, action: "UPDATE", before: { title: t.title, status: t.status, evidenceUrl: t.evidenceUrl }, after: { ...data, origem: "check-in", dia: input.day } });
    if (data.status === "DONE") {
      completed++;
      const finalEvidence = data.evidenceUrl !== undefined ? data.evidenceUrl : t.evidenceUrl;
      if (t.requiresEvidence && !hasEvidence({ evidenceUrl: finalEvidence, asanaAttachments: t.asanaAttachments })) {
        warnings.push(`“${t.title}” exige evidência: só conta na nota depois de anexar no Asana ou colar o link.`);
      }
    }
    if (data.evidenceUrl) evidences++;
  }

  // 2) Demandas extras
  const valid = input.extras.map((e) => ({ ...e, title: e.title.trim().slice(0, 200) })).filter((e) => e.title);
  if (valid.length) {
    const projects = await prisma.project.findMany({ where: { id: { in: valid.map((e) => e.projectId).filter(Boolean) } } });
    // Evita duplicar se o check-in for salvo de novo com as mesmas linhas
    const sameDay = await prisma.task.findMany({
      where: { assigneeId: input.userId, unplanned: true, completedAt: { gte: new Date(`${input.day}T00:00:00.000Z`), lt: new Date(Date.parse(`${input.day}T00:00:00.000Z`) + 2 * 86400_000) } },
      select: { title: true, completedAt: true },
    });
    const existingTitles = new Set(sameDay.filter((t) => t.completedAt && todayKey(t.completedAt) === input.day).map((t) => normalize(t.title)));
    for (const e of valid) {
      if (existingTitles.has(normalize(e.title))) continue;
      existingTitles.add(normalize(e.title));
      const project = projects.find((p) => p.id === e.projectId) ?? null;
      const ev = url(e.evidenceUrl, e.title) ?? null;
      let asana: { gid: string; url: string | null } | null = null;
      if (project?.asanaGid && asanaConfigured()) {
        try {
          asana = await createAsanaCompletedTask({
            name: e.title,
            projectGid: project.asanaGid,
            assigneeEmail: user.asanaEmails[0] ?? user.email,
            notes: `Demanda extra registrada no check-in do SistemArquea (${input.day}).${ev ? `\nEvidência: ${ev}` : ""}`,
          });
        } catch (err) {
          warnings.push(`“${e.title}” foi registrada só no SistemArquea: o Asana recusou (${asanaMsg(err)}).`);
        }
      }
      const task = await prisma.task.create({
        data: {
          kind: "TASK",
          title: e.title,
          assigneeId: input.userId,
          createdById: input.actorId,
          status: "DONE",
          completedAt: when,
          createdAt: when,
          unplanned: true,
          evidenceUrl: ev,
          projectId: project?.id ?? null,
          asanaGid: asana?.gid ?? null,
          asanaUrl: asana?.url ?? null,
        },
      });
      await audit({ actorId: input.actorId, subjectUserId: input.userId, entityType: "Task", entityId: task.id, action: "CREATE", after: { title: e.title, demandaExtra: true, dia: input.day, projeto: project?.name ?? null, evidenceUrl: ev, asana: !!asana } });
      extras++;
    }
  }

  if (completed || extras || evidences) await recomputeAutoIndicators({ userIds: [input.userId] });
  return { completed, extras, evidences, warnings };
}
