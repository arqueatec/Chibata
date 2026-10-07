import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { parseAutoRule, normalize } from "@/lib/domain/autoIndicators";
import { todayKey } from "@/lib/domain/dates";
import { recomputeAutoIndicators } from "@/lib/services/autoIndicators";
import { asanaConfigured, asanaGet, asanaGetAll, AsanaError, TASK_FIELDS } from "./client";
import { customFieldsMap, isSampleTask, statusFromAsana, userForAsanaEmail, type AsanaTask, type AppUserRef } from "./mapping";

// ---------------------------------------------------------------------------------------------
// Configuração (guardada no banco)
// ---------------------------------------------------------------------------------------------

export interface SyncReport {
  at: string;
  ok: boolean;
  trigger: string;
  durationMs: number;
  projects: number;
  created: number;
  updated: number;
  linked: number;
  removed: number;
  skippedSamples: number;
  unassigned: number;
  /** E-mails do Asana com tarefas mas sem pessoa vinculada no app. */
  unmappedEmails: string[];
  fieldChanges: number;
  autoEntries: number;
  error?: string;
}

export interface AsanaSettings {
  workspaceGid?: string;
  projectGids: string[];
  lastSync?: SyncReport;
}

const KEY = "asana";

export async function getAsanaSettings(): Promise<AsanaSettings> {
  const row = await prisma.integrationSetting.findUnique({ where: { key: KEY } });
  const v = (row?.value ?? {}) as Partial<AsanaSettings>;
  return { workspaceGid: v.workspaceGid, projectGids: v.projectGids ?? [], lastSync: v.lastSync };
}

export async function saveAsanaSettings(patch: Partial<AsanaSettings>) {
  const cur = await getAsanaSettings();
  const value = { ...cur, ...patch } as unknown as Prisma.InputJsonValue;
  await prisma.integrationSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

export async function asanaEnabled() {
  if (!asanaConfigured()) return false;
  return (await getAsanaSettings()).projectGids.length > 0;
}

// ---------------------------------------------------------------------------------------------
// Sincronização (Asana → app)
// ---------------------------------------------------------------------------------------------

const STORY_FIELDS = "created_at,resource_subtype,custom_field.name,new_enum_value.name,new_text_value,new_number_value,new_date_value.date";
const FIELD_CHANGE_SUBTYPES = new Set([
  "enum_custom_field_changed",
  "text_custom_field_changed",
  "number_custom_field_changed",
  "multi_enum_custom_field_changed",
  "date_custom_field_changed",
]);

type Story = {
  gid: string;
  created_at: string;
  resource_subtype: string;
  custom_field?: { name: string } | null;
  new_enum_value?: { name: string } | null;
  new_text_value?: string | null;
  new_number_value?: number | null;
  new_date_value?: { date: string } | null;
};

let running: Promise<SyncReport> | null = null;

/**
 * Sincroniza os projetos escolhidos. O Asana é a fonte de título, prazo, responsável e status
 * das tarefas vinculadas. A descrição das tarefas não é importada (minimização de dados).
 */
export function syncAsana(opts: { actorId: string | null; trigger: "cron" | "manual" | "checkin" }): Promise<SyncReport> {
  // evita duas sincronizações simultâneas na mesma instância
  running ??= doSync(opts).finally(() => (running = null));
  return running;
}

async function doSync(opts: { actorId: string | null; trigger: string }): Promise<SyncReport> {
  const started = Date.now();
  const report: SyncReport = {
    at: new Date().toISOString(),
    ok: false,
    trigger: opts.trigger,
    durationMs: 0,
    projects: 0,
    created: 0,
    updated: 0,
    linked: 0,
    removed: 0,
    skippedSamples: 0,
    unassigned: 0,
    unmappedEmails: [],
    fieldChanges: 0,
    autoEntries: 0,
  };
  try {
    if (!asanaConfigured()) throw new AsanaError("Integração com o Asana não configurada (falta ASANA_TOKEN).");
    const settings = await getAsanaSettings();
    if (settings.projectGids.length === 0) throw new AsanaError("Nenhum projeto do Asana selecionado para sincronizar.");

    const users: AppUserRef[] = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true, asanaEmails: true } });
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" } });
    const creatorId = opts.actorId ?? admin?.id;
    if (!creatorId) throw new AsanaError("Nenhum administrador ativo para registrar as tarefas importadas.");
    const unmapped = new Set<string>();

    // Projetos que precisam do histórico de mudanças de campos (regras FIELD_CHANGED_TO)
    const fieldRules = (await prisma.indicator.findMany({ where: { active: true }, select: { autoRule: true } }))
      .map((i) => parseAutoRule(i.autoRule))
      .filter((r) => r?.type === "FIELD_CHANGED_TO");
    const storyProjectIds = new Set(fieldRules.flatMap((r) => r!.projectIds));
    const storiesForAll = fieldRules.some((r) => r!.projectIds.length === 0);
    const storiesSince = new Date(Date.now() - 40 * 86400_000);

    for (const projectGid of settings.projectGids) {
      const ap = await asanaGet<{ gid: string; name: string; archived?: boolean }>(`/projects/${projectGid}`, { opt_fields: "name,archived" });
      const project = await upsertProject(ap.gid, ap.name);
      report.projects++;

      const top = await asanaGetAll<AsanaTask>(`/projects/${projectGid}/tasks`, { opt_fields: TASK_FIELDS });
      const all: { task: AsanaTask; parentGid: string | null }[] = top.map((t) => ({ task: t, parentGid: null }));
      for (const t of top) {
        if ((t.num_subtasks ?? 0) > 0) {
          const subs = await asanaGetAll<AsanaTask>(`/tasks/${t.gid}/subtasks`, { opt_fields: TASK_FIELDS });
          all.push(...subs.map((s) => ({ task: s, parentGid: t.gid })));
        }
      }

      const seen = new Set<string>();
      const appIdByGid = new Map<string, string>();
      for (const { task: t, parentGid } of all) {
        if (isSampleTask(t.name)) {
          report.skippedSamples++;
          continue;
        }
        if (!t.assignee) {
          report.unassigned++;
          continue;
        }
        const user = userForAsanaEmail(t.assignee.email, users);
        if (!user) {
          if (t.assignee.email) unmapped.add(t.assignee.email.toLowerCase());
          continue;
        }
        seen.add(t.gid);
        const { status, blockedReason } = statusFromAsana(t);
        const data = {
          title: t.name.trim().slice(0, 200) || "(sem título no Asana)",
          assigneeId: user.id,
          dueDate: t.due_on ? new Date(`${t.due_on}T00:00:00.000Z`) : null,
          status,
          blockedReason,
          completedAt: t.completed && t.completed_at ? new Date(t.completed_at) : null,
          projectId: project.id,
          parentId: parentGid ? (appIdByGid.get(parentGid) ?? null) : null,
          asanaUrl: t.permalink_url ?? null,
          asanaFields: customFieldsMap(t.custom_fields) as Prisma.InputJsonValue,
          asanaSyncedAt: new Date(),
        };

        let existing = await prisma.task.findUnique({ where: { asanaGid: t.gid } });
        if (!existing) {
          // Meta/tarefa já cadastrada no app (ex.: pela carga de metas): vincula em vez de duplicar
          const candidates = await prisma.task.findMany({ where: { asanaGid: null, assigneeId: user.id } });
          const match = candidates.find((c) => normalize(c.title) === normalize(data.title));
          if (match) {
            existing = await prisma.task.update({ where: { id: match.id }, data: { asanaGid: t.gid } });
            report.linked++;
          }
        }
        if (existing) {
          const keepGoal = existing.kind === "GOAL" || (t.num_subtasks ?? 0) > 0;
          await prisma.task.update({ where: { id: existing.id }, data: { ...data, kind: keepGoal ? "GOAL" : "TASK" } });
          appIdByGid.set(t.gid, existing.id);
          report.updated++;
        } else {
          const created = await prisma.task.create({
            data: { ...data, asanaGid: t.gid, kind: (t.num_subtasks ?? 0) > 0 && !parentGid ? "GOAL" : "TASK", createdById: creatorId, createdAt: new Date(t.created_at) },
          });
          appIdByGid.set(t.gid, created.id);
          report.created++;
        }

        // Histórico de mudanças de campos, só quando alguma regra precisa
        const wantsStories = storiesForAll || storyProjectIds.has(project.id);
        if (wantsStories && (!t.modified_at || new Date(t.modified_at) >= storiesSince)) {
          const stories = await asanaGetAll<Story>(`/tasks/${t.gid}/stories`, { opt_fields: STORY_FIELDS });
          const appTaskId = appIdByGid.get(t.gid)!;
          for (const s of stories) {
            if (!FIELD_CHANGE_SUBTYPES.has(s.resource_subtype) || !s.custom_field?.name) continue;
            if (new Date(s.created_at) < storiesSince) continue;
            const toValue = s.new_enum_value?.name ?? s.new_text_value ?? (s.new_number_value != null ? String(s.new_number_value) : null) ?? s.new_date_value?.date ?? null;
            const r = await prisma.taskFieldChange.upsert({
              where: { asanaGid: s.gid },
              create: { asanaGid: s.gid, taskId: appTaskId, field: s.custom_field.name, toValue, changedAt: new Date(s.created_at) },
              update: {},
            });
            if (r) report.fieldChanges++;
          }
        }
      }

      // Tarefas que saíram do projeto no Asana (ou perderam o responsável vinculado)
      const stale = await prisma.task.findMany({
        where: { projectId: project.id, asanaGid: { not: null, notIn: [...seen] } },
        include: { _count: { select: { feedbacks: true } } },
      });
      for (const s of stale) {
        await prisma.task.updateMany({ where: { parentId: s.id }, data: { parentId: null } });
        if (s._count.feedbacks === 0) await prisma.task.delete({ where: { id: s.id } });
        else await prisma.task.update({ where: { id: s.id }, data: { asanaGid: null, asanaUrl: null } });
        report.removed++;
      }
    }

    report.unmappedEmails = [...unmapped].sort();
    const auto = await recomputeAutoIndicators();
    report.autoEntries = auto.upserted + auto.removed;
    report.ok = true;
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
    if (!(e instanceof AsanaError)) console.error("[asana] falha na sincronização", e);
  }
  report.durationMs = Date.now() - started;
  await saveAsanaSettings({ lastSync: report });
  if (opts.trigger !== "checkin") {
    await audit({
      actorId: opts.actorId,
      entityType: "Integration",
      entityId: "asana",
      action: "SYNC",
      after: { ok: report.ok, criadas: report.created, atualizadas: report.updated, vinculadas: report.linked, removidas: report.removed, erro: report.error ?? null },
    });
  }
  return report;
}

async function upsertProject(asanaGid: string, name: string) {
  const byGid = await prisma.project.findUnique({ where: { asanaGid } });
  if (byGid) return byGid.name === name ? byGid : prisma.project.update({ where: { id: byGid.id }, data: { name: await freeName(name, byGid.id) } });
  const byName = await prisma.project.findUnique({ where: { name } });
  if (byName && !byName.asanaGid) return prisma.project.update({ where: { id: byName.id }, data: { asanaGid } });
  return prisma.project.create({ data: { name: await freeName(name), asanaGid, kind: "PROJECT" } });
}

/** Nome de projeto é único no app: acrescenta " (Asana)" se já houver outro com o mesmo nome. */
async function freeName(name: string, selfId?: string) {
  const clash = await prisma.project.findUnique({ where: { name } });
  return clash && clash.id !== selfId ? `${name} (Asana)` : name;
}

/** Sincroniza em segundo plano se a última sincronização tiver mais de `maxAgeMin` minutos. */
export async function syncIfStale(maxAgeMin = 10) {
  if (!(await asanaEnabled())) return null;
  const last = (await getAsanaSettings()).lastSync;
  if (last && Date.now() - new Date(last.at).getTime() < maxAgeMin * 60_000) return null;
  return syncAsana({ actorId: null, trigger: "checkin" });
}

export function lastSyncAgeLabel(last?: SyncReport) {
  if (!last) return "nunca";
  const min = Math.round((Date.now() - new Date(last.at).getTime()) / 60_000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `em ${todayKey(new Date(last.at)).split("-").reverse().join("/")}`;
}
