import { requireAdminPage } from "@/lib/authz";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Badge, Card } from "@/components/ui";
import { saveProject } from "@/app/actions/admin";
import { prisma } from "@/lib/db";

export const metadata = { title: "Administração · Projetos" };

function ProjectForm({ p }: { p: { id?: string; name: string; kind: string; active: boolean } }) {
  return (
    <ActionForm action={saveProject} resetOnSuccess={!p.id} className="flex flex-wrap items-end gap-2">
      {p.id && <input type="hidden" name="id" value={p.id} />}
      <div className="min-w-48 flex-1"><label className="label">Nome</label><input name="name" required defaultValue={p.name} className="input" /></div>
      <div>
        <label className="label">Tipo</label>
        <select name="kind" defaultValue={p.kind} className="input"><option value="PROJECT">Projeto</option><option value="CLIENT">Cliente</option></select>
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} className="h-5 w-5" /> Ativo</label>
      <SubmitButton className="btn-primary btn-sm">{p.id ? "Salvar" : "Adicionar"}</SubmitButton>
    </ActionForm>
  );
}

export default async function AdminProjects() {
  // Autorização verificada também na página (layouts e páginas renderizam em paralelo)
  await requireAdminPage();
  const projects = await prisma.project.findMany({ include: { _count: { select: { tasks: true } } }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  return (
    <div className="space-y-4">
      <Card title="Adicionar projeto ou cliente"><ProjectForm p={{ name: "", kind: "PROJECT", active: true }} /></Card>
      <Card title="Projetos e clientes">
        <ul className="divide-y divide-slate-100">
          {projects.map((p) => (
            <li key={p.id} className="py-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                <Badge tone={p.kind === "CLIENT" ? "blue" : "brand"}>{p.kind === "CLIENT" ? "Cliente" : "Projeto"}</Badge>
                {p._count.tasks} tarefa(s)
              </div>
              <ProjectForm p={p} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
