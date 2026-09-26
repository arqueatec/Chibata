import { requireAdminPage } from "@/lib/authz";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Badge, Card } from "@/components/ui";
import { saveUser } from "@/app/actions/admin";
import { prisma } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/format";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

export const metadata = { title: "Administração · Pessoas" };

type U = { id?: string; name: string; email: string; role: string; jobTitle: string | null; areaId: string | null; managerId: string | null; active: boolean };

export default async function AdminPeople() {
  // Autorização verificada também na página (layouts e páginas renderizam em paralelo)
  await requireAdminPage();
  const [users, areas] = await Promise.all([
    prisma.user.findMany({ include: { area: true, manager: { select: { name: true } } }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const Form = ({ u }: { u: U }) => (
    <ActionForm action={saveUser} resetOnSuccess={!u.id} className="space-y-3">
      {u.id && <input type="hidden" name="id" value={u.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div><label className="label">Nome</label><input name="name" required defaultValue={u.name} className="input" /></div>
        <div><label className="label">E-mail</label><input name="email" type="email" required defaultValue={u.email} className="input" /></div>
        <div><label className="label">Cargo/função</label><input name="jobTitle" defaultValue={u.jobTitle ?? ""} className="input" /></div>
        <div>
          <label className="label">Perfil de acesso</label>
          <select name="role" defaultValue={u.role} className="input">
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Área</label>
          <select name="areaId" defaultValue={u.areaId ?? ""} className="input">
            <option value="">— sem área —</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Liderado(a) por</label>
          <select name="managerId" defaultValue={u.managerId ?? ""} className="input">
            <option value="">— ninguém —</option>
            {users.filter((x) => x.id !== u.id && x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{u.id ? "Redefinir senha" : "Senha inicial"} <span className="font-normal text-slate-400">(opcional)</span></label>
          <input name="password" type="password" minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" className="input" />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={u.active} className="h-5 w-5" /> Ativo</label>
      </div>
      <SubmitButton className="btn-primary btn-sm">{u.id ? "Salvar" : "Adicionar pessoa"}</SubmitButton>
    </ActionForm>
  );
  return (
    <div className="space-y-4">
      <Card title="Adicionar pessoa">
        <p className="mb-3 text-xs text-slate-500">
          Coordenadores(as) veem e comentam os dados das pessoas que lideram (campo “Liderado(a) por”). Sem senha, a pessoa entra por link mágico enviado ao e-mail.
        </p>
        <Form u={{ name: "", email: "", role: "COLLABORATOR", jobTitle: null, areaId: null, managerId: null, active: true }} />
      </Card>
      <Card title={`Equipe (${users.length})`}>
        <ul className="divide-y divide-slate-100">
          {users.map((u) => (
            <li key={u.id} className="py-2">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{u.name}</span>
                  <span className="text-slate-500">{u.email}</span>
                  <Badge tone={u.role === "ADMIN" ? "brand" : u.role === "COORDINATOR" ? "blue" : "gray"}>{ROLE_LABEL[u.role]}</Badge>
                  {u.area && <Badge>{u.area.name}</Badge>}
                  {u.manager && <span className="text-xs text-slate-500">↳ {u.manager.name}</span>}
                  {!u.active && <Badge tone="red">inativo</Badge>}
                </summary>
                <div className="mt-3"><Form u={u} /></div>
              </details>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
