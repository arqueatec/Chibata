import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { IndicatorForm } from "@/components/IndicatorForm";
import { Card, PageHeader } from "@/components/ui";
import { changePassword, logoutOtherSessions, updatePreferences } from "@/app/actions/account";
import { requireAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { formatDateTime, PERIOD_LABEL, ROLE_LABEL } from "@/lib/format";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

export const metadata = { title: "Meus dados" };

export default async function MyDataPage() {
  const { user } = await requireAccess();
  const [full, counts, personal, sessions] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { area: true, manager: { select: { name: true } } } }),
    Promise.all([
      prisma.checkIn.count({ where: { userId: user.id } }),
      prisma.indicatorEntry.count({ where: { userId: user.id } }),
      prisma.task.count({ where: { assigneeId: user.id } }),
      prisma.feedback.count({ where: { targetUserId: user.id } }),
      prisma.monthlyReview.count({ where: { userId: user.id } }),
      prisma.auditLog.count({ where: { subjectUserId: user.id } }),
    ]),
    prisma.indicator.findMany({ where: { ownerId: user.id }, orderBy: { sortOrder: "asc" } }),
    prisma.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
  ]);
  const [ci, ie, tk, fb, rv, au] = counts;
  const projects = (await prisma.project.findMany({ where: { active: true }, select: { id: true, name: true, asanaGid: true }, orderBy: { name: "asc" } })).map((p) => ({ id: p.id, name: p.name, fromAsana: !!p.asanaGid }));
  const allowPersonal = !!full.area?.allowPersonalIndicators;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Meus dados" subtitle="Transparência e controle sobre as informações registradas sobre você (LGPD)." />

      <Card title="O que é registrado sobre você">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Nome</dt><dd>{full.name}</dd></div>
          <div><dt className="text-slate-500">E-mail</dt><dd>{full.email}</dd></div>
          <div><dt className="text-slate-500">Perfil de acesso</dt><dd>{ROLE_LABEL[full.role]}</dd></div>
          <div><dt className="text-slate-500">Área / função</dt><dd>{full.area?.name ?? "—"} · {full.jobTitle ?? "—"}</dd></div>
          <div><dt className="text-slate-500">Liderança</dt><dd>{full.manager?.name ?? "—"}</dd></div>
          <div><dt className="text-slate-500">Cadastro</dt><dd>{formatDateTime(full.createdAt)}</dd></div>
        </dl>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <li className="rounded bg-slate-50 p-2"><strong>{ci}</strong> check-ins</li>
          <li className="rounded bg-slate-50 p-2"><strong>{ie}</strong> lançamentos de indicadores</li>
          <li className="rounded bg-slate-50 p-2"><strong>{tk}</strong> metas/tarefas</li>
          <li className="rounded bg-slate-50 p-2"><strong>{fb}</strong> feedbacks recebidos</li>
          <li className="rounded bg-slate-50 p-2"><strong>{rv}</strong> revisões mensais</li>
          <li className="rounded bg-slate-50 p-2"><strong>{au}</strong> registros de auditoria</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Coletamos apenas dados necessários à gestão do trabalho: identificação profissional, check-ins, indicadores, tarefas, feedbacks e revisões. Não coletamos localização,
          dados pessoais sensíveis nem monitoramento de atividade. Quem pode ver seus dados: você{full.manager ? `, ${full.manager.name} (liderança)` : ""} e o administrador.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/api/export" className="btn-primary btn-sm">Exportar meus dados (JSON)</a>
          <Link href={`/pessoas/${user.id}`} className="btn-secondary btn-sm">Ver histórico e auditoria</Link>
        </div>
      </Card>

      <Card title="Lembretes de check-in">
        <ActionForm action={updatePreferences} className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="reminderEnabled" defaultChecked={full.reminderEnabled} className="h-5 w-5" />
            Receber lembrete por e-mail nos dias úteis em que eu ainda não tiver feito o check-in
          </label>
          {!emailConfigured() && <p className="hint">O envio de e-mails ainda não está configurado neste ambiente.</p>}
          <SubmitButton className="btn-secondary btn-sm">Salvar preferência</SubmitButton>
        </ActionForm>
      </Card>

      {allowPersonal && (
        <Card title="Meus indicadores livres">
          <p className="mb-3 text-xs text-slate-500">Sua área permite indicadores pessoais. Eles entram no seu check-in e na sua nota.</p>
          <ul className="mb-4 divide-y divide-slate-100">
            {personal.map((i) => (
              <li key={i.id} className="py-2">
                <details>
                  <summary className="cursor-pointer text-sm"><span className="font-medium">{i.name}</span> <span className="text-slate-500">· meta {PERIOD_LABEL[i.targetPeriod]} {i.targetValue} · peso {i.weight}{i.active ? "" : " · inativo"}</span></summary>
                  <div className="mt-3"><IndicatorForm values={i} fixedOwner={user.id} projects={projects} /></div>
                </details>
              </li>
            ))}
          </ul>
          <h3 className="mb-2 text-sm font-semibold">Novo indicador</h3>
          <IndicatorForm fixedOwner={user.id} projects={projects} values={{ name: "", description: null, unit: "COUNT", direction: "HIGHER_BETTER", aggregation: "SUM", targetValue: 1, targetPeriod: "WEEKLY", weight: 1, sortOrder: personal.length, active: true, areaId: null, ownerId: user.id }} />
        </Card>
      )}

      <Card title="Segurança">
        <ActionForm action={changePassword} resetOnSuccess className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="current">Senha atual</label><input id="current" name="current" type="password" autoComplete="current-password" className="input" /></div>
          <div><label className="label" htmlFor="next">Nova senha</label><input id="next" name="next" type="password" minLength={MIN_PASSWORD_LENGTH} required autoComplete="new-password" className="input" /></div>
          <div className="sm:col-span-2"><SubmitButton className="btn-secondary btn-sm">Alterar senha</SubmitButton></div>
        </ActionForm>
        <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4 text-sm">
          <span>{sessions} sessão(ões) ativa(s).</span>
          <ActionForm action={logoutOtherSessions} className="">
            <SubmitButton className="btn-secondary btn-sm" pendingText="…">Sair dos outros dispositivos</SubmitButton>
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}
