import { requireAdminPage } from "@/lib/authz";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Badge, Card } from "@/components/ui";
import { runCrmSync, saveCrmPeople } from "@/app/actions/crm";
import { prisma } from "@/lib/db";
import { crmAppUrl, crmConfigured } from "@/lib/crm/client";
import { getCrmSettings } from "@/lib/crm/sync";
import { suggestUserFor } from "@/lib/asana/mapping";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Administração · CRM" };

export default async function AdminCrm() {
  // Autorização verificada também na página (layouts e páginas renderizam em paralelo)
  await requireAdminPage();
  if (!crmConfigured()) return <NotConfigured />;
  const { lastSync: last } = await getCrmSettings();
  const people = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true, crmEmails: true, asanaEmails: true }, orderBy: { name: "asc" } });
  const crmUsers = last?.crmUsers ?? [];

  return (
    <div className="space-y-4">
      <Card title="CRM NoFire">
        <p className="text-sm text-slate-700">
          Endereço: <a className="link" href={crmAppUrl()} target="_blank" rel="noopener noreferrer">{crmAppUrl()}</a>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span>
            Última sincronização: <strong>{last ? formatDateTime(new Date(last.at)) : "nunca"}</strong>
          </span>
          {last && <Badge tone={last.ok ? "green" : "red"}>{last.ok ? "ok" : "falhou"}</Badge>}
          <ActionForm action={runCrmSync} className="">
            <SubmitButton className="btn-primary btn-sm" pendingText="Sincronizando…">↻ Sincronizar agora</SubmitButton>
          </ActionForm>
        </div>
        {last && (
          <p className={`mt-3 rounded-lg p-3 text-xs ${last.ok ? "bg-slate-50 text-slate-600" : "bg-red-50 text-red-700"}`}>
            {last.ok ? `${last.accounts} conta(s) · ${last.events} evento(s) (contas criadas, contatos, mudanças de etapa e vendas dos últimos 60 dias)` : last.error}
          </p>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Somente leitura: o Chibata não altera nada no CRM. Sincroniza todo dia às 7h45, ao abrir o check-in ou o painel Comercial (se a última tiver mais de 10 minutos) e
          por este botão. Não são copiados contatos pessoais dos clientes nem o fluxo de caixa.
        </p>
      </Card>

      <Card title="Pessoas: usuário do CRM ↔ pessoa no Chibata">
        {crmUsers.length === 0 ? (
          <p className="text-sm text-slate-500">Sincronize uma vez para listar os usuários do CRM.</p>
        ) : (
          <ActionForm action={saveCrmPeople}>
            <p className="text-xs text-slate-500">
              Quem tem vínculo vê o painel Comercial e recebe no check-in os contatos e as próximas ações do CRM. Indicadores com “só o que a pessoa fez” usam este vínculo.
            </p>
            <input type="hidden" name="count" value={crmUsers.length} />
            <div className="divide-y divide-slate-100">
              {crmUsers.map((u, i) => {
                const current = people.find((p) => p.crmEmails.includes(u.email));
                const suggestion = current ?? suggestUserFor({ email: u.email, name: u.name }, people.map((p) => ({ ...p, asanaEmails: p.crmEmails })));
                return (
                  <div key={u.email} className="grid grid-cols-1 items-center gap-2 py-2 sm:grid-cols-2">
                    <div className="text-sm">
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                      <input type="hidden" name={`email_${i}`} value={u.email} />
                    </div>
                    <div className="flex items-center gap-2">
                      <select name={`user_${i}`} defaultValue={suggestion?.id ?? ""} className="input">
                        <option value="">— não vincular —</option>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
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
        )}
      </Card>

      <Card title="Indicadores de vendas automáticos">
        <p className="text-sm text-slate-600">
          Em <a className="link" href="/admin/indicadores">Indicadores</a>, escolha em “Preenchimento” uma regra do CRM: contas cadastradas (com filtro de segmento, ex.: “Bombeiros”
          para institucionais ou “exceto Bombeiros” para privados), contatos registrados, contas que entraram numa etapa do funil (ex.: etapa 5 = teste em andamento), litros vendidos
          ou receita. Os litros vêm das vendas registradas na seção “Vendas” de cada conta do CRM.
        </p>
      </Card>
    </div>
  );
}

function NotConfigured() {
  return (
    <Card title="Conectar ao CRM NoFire">
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>No CRM, aplique a atualização de integração e crie a variável <code className="rounded bg-slate-100 px-1">CHIBATA_API_TOKEN</code> com um valor aleatório longo.</li>
        <li>
          Aqui no Chibata (Vercel → Settings → Environments → Production), crie <code className="rounded bg-slate-100 px-1">CRM_API_URL</code> (endereço do CRM),{" "}
          <code className="rounded bg-slate-100 px-1">CRM_API_TOKEN</code> (o mesmo valor do CHIBATA_API_TOKEN) e, se o CRM tiver proteção de deploy da Vercel,{" "}
          <code className="rounded bg-slate-100 px-1">CRM_BYPASS_SECRET</code>.
        </li>
        <li>Faça um redeploy e volte a esta página.</li>
      </ol>
    </Card>
  );
}
