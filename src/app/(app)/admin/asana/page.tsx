import { requireAdminPage } from "@/lib/authz";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Badge, Card } from "@/components/ui";
import { runAsanaSync, saveAsanaPeople, saveAsanaProjects } from "@/app/actions/asana";
import { prisma } from "@/lib/db";
import { asanaConfigured, asanaGet, asanaGetAll, AsanaError } from "@/lib/asana/client";
import { suggestUserFor } from "@/lib/asana/mapping";
import { getAsanaSettings, lastSyncAgeLabel } from "@/lib/asana/sync";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Administração · Asana" };

type Named = { gid: string; name: string };

export default async function AdminAsana() {
  // Autorização verificada também na página (layouts e páginas renderizam em paralelo)
  await requireAdminPage();
  if (!asanaConfigured()) return <NotConfigured />;

  const settings = await getAsanaSettings();
  let me: { name: string; email: string; workspaces: Named[] } | null = null;
  let projects: Named[] = [];
  let asanaUsers: { gid: string; name: string; email: string | null }[] = [];
  let error: string | null = null;
  try {
    me = await asanaGet("/users/me", { opt_fields: "name,email,workspaces.name" });
    const ws = settings.workspaceGid && me!.workspaces.some((w) => w.gid === settings.workspaceGid) ? settings.workspaceGid : me!.workspaces[0]?.gid;
    if (ws) {
      [projects, asanaUsers] = await Promise.all([
        asanaGetAll<Named>("/projects", { workspace: ws, archived: false, opt_fields: "name" }),
        asanaGetAll<{ gid: string; name: string; email: string | null }>("/users", { workspace: ws, opt_fields: "name,email" }),
      ]);
    }
  } catch (e) {
    error = e instanceof AsanaError ? e.message : "Não foi possível conectar ao Asana.";
  }
  const workspaceGid = settings.workspaceGid ?? me?.workspaces[0]?.gid ?? "";
  const appUsers = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true, asanaEmails: true }, orderBy: { name: "asc" } });
  const last = settings.lastSync;
  const withEmail = asanaUsers.filter((u) => u.email);

  return (
    <div className="space-y-4">
      <Card title="Conexão">
        {error ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>
        ) : (
          <p className="text-sm text-slate-700">
            Conectado como <strong>{me?.name}</strong> ({me?.email}).
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span>
            Última sincronização: <strong>{lastSyncAgeLabel(last)}</strong>
            {last && <span className="text-slate-500"> ({formatDateTime(new Date(last.at))})</span>}
          </span>
          {last && <Badge tone={last.ok ? "green" : "red"}>{last.ok ? "ok" : "falhou"}</Badge>}
          <ActionForm action={runAsanaSync} className="">
            <SubmitButton className="btn-primary btn-sm" pendingText="Sincronizando… (pode levar até 1 min)">↻ Sincronizar agora</SubmitButton>
          </ActionForm>
        </div>
        {last && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            {last.ok ? (
              <>
                {last.projects} projeto(s) · {last.created} tarefa(s) criada(s) · {last.updated} atualizada(s) · {last.linked} vinculada(s) a metas existentes · {last.removed} removida(s) ·{" "}
                {last.skippedSamples} de exemplo ignorada(s) · {last.unassigned} sem responsável no Asana (não importadas) · {last.autoEntries} lançamento(s) automático(s) recalculado(s)
                {last.unmappedEmails.length > 0 && (
                  <p className="mt-1 text-amber-800">⚠ Tarefas de contas sem pessoa vinculada (não importadas): {last.unmappedEmails.join(", ")}</p>
                )}
              </>
            ) : (
              <span className="text-red-700">{last.error}</span>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          A sincronização roda automaticamente todo dia às 7h45, quando alguém abre o check-in (se a última tiver mais de 10 minutos) e por este botão. São importados título,
          responsável, prazo, status, link e campos personalizados das tarefas; a descrição não é importada.
        </p>
      </Card>

      {!error && (
        <>
          <Card title="Projetos sincronizados">
            <ActionForm action={saveAsanaProjects}>
              <input type="hidden" name="workspaceGid" value={workspaceGid} />
              <div className="grid gap-2 sm:grid-cols-2">
                {projects.map((p) => (
                  <label key={p.gid} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                    <input type="checkbox" name="project" value={p.gid} defaultChecked={settings.projectGids.includes(p.gid)} className="h-5 w-5" />
                    {p.name}
                  </label>
                ))}
              </div>
              {projects.length === 0 && <p className="text-sm text-slate-500">Nenhum projeto encontrado no Asana.</p>}
              <SubmitButton className="btn-secondary btn-sm">Salvar projetos</SubmitButton>
            </ActionForm>
          </Card>

          <Card title="Pessoas: conta do Asana ↔ pessoa no app">
            <p className="mb-3 text-xs text-slate-500">
              As tarefas são atribuídas no app pela conta do responsável no Asana. As sugestões vêm do e-mail ou do primeiro nome; confira e salve. Contas sem pessoa ficam de fora.
            </p>
            <ActionForm action={saveAsanaPeople}>
              <input type="hidden" name="count" value={withEmail.length} />
              <div className="divide-y divide-slate-100">
                {withEmail.map((u, i) => {
                  const current = appUsers.find((a) => a.asanaEmails.map((e) => e.toLowerCase()).includes(u.email!.toLowerCase()));
                  const suggestion = current ?? suggestUserFor({ email: u.email, name: u.name }, appUsers);
                  return (
                    <div key={u.gid} className="grid grid-cols-1 items-center gap-2 py-2 sm:grid-cols-2">
                      <div className="text-sm">
                        <div className="font-medium">{u.name}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                        <input type="hidden" name={`email_${i}`} value={u.email!} />
                      </div>
                      <div className="flex items-center gap-2">
                        <select name={`user_${i}`} defaultValue={suggestion?.id ?? ""} className="input">
                          <option value="">— não vincular —</option>
                          {appUsers.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                        {!current && suggestion && <Badge tone="yellow">sugestão</Badge>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <SubmitButton className="btn-secondary btn-sm">Salvar vínculos</SubmitButton>
            </ActionForm>
          </Card>
        </>
      )}

      <Card title="Indicadores automáticos">
        <p className="text-sm text-slate-600">
          Em <a className="link" href="/admin/indicadores">Indicadores</a>, escolha em “Preenchimento” uma regra automática: tarefas concluídas, criadas ou atrasadas (com filtro
          por projeto e por texto no título), soma de um campo numérico (ex.: “Valor estimado”) ou vezes que um campo mudou para um valor (ex.: “Status do lead” = “Reunião”).
          Esses indicadores aparecem no check-in já preenchidos e sem edição.
        </p>
      </Card>
    </div>
  );
}

function NotConfigured() {
  return (
    <Card title="Conectar ao Asana">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>
          No Asana, clique na sua foto → <strong>Configurações</strong> → <strong>Apps</strong> → <strong>Ver aplicativos de desenvolvedor</strong> →{" "}
          <strong>Console do desenvolvedor</strong> → <strong>Criar novo token</strong>. Use uma conta que veja todos os projetos da equipe.
        </li>
        <li>
          Na Vercel, abra o projeto → <strong>Settings → Environments → Production</strong> e adicione a variável <code className="rounded bg-slate-100 px-1">ASANA_TOKEN</code>{" "}
          com o token (tipo Secret).
        </li>
        <li>Faça um novo deploy (Deployments → ⋯ → Redeploy) e volte a esta página.</li>
      </ol>
    </Card>
  );
}
