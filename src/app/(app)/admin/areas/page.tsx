import { requireAdminPage } from "@/lib/authz";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Badge, Card } from "@/components/ui";
import { saveArea } from "@/app/actions/admin";
import { prisma } from "@/lib/db";

export const metadata = { title: "Administração · Áreas" };

type A = { id?: string; name: string; description: string | null; indicatorsWeight: number; checkinWeight: number; allowPersonalIndicators: boolean; active: boolean };

function AreaForm({ a }: { a: A }) {
  return (
    <ActionForm action={saveArea} resetOnSuccess={!a.id} className="space-y-3">
      {a.id && <input type="hidden" name="id" value={a.id} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2"><label className="label">Nome</label><input name="name" required defaultValue={a.name} className="input" /></div>
        <div><label className="label">Peso dos indicadores</label><input name="indicatorsWeight" inputMode="numeric" required defaultValue={a.indicatorsWeight} className="input" /></div>
        <div><label className="label">Peso do check-in</label><input name="checkinWeight" inputMode="numeric" required defaultValue={a.checkinWeight} className="input" /></div>
        <div className="col-span-2 sm:col-span-4"><label className="label">Descrição</label><input name="description" defaultValue={a.description ?? ""} className="input" /></div>
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" name="allowPersonalIndicators" defaultChecked={a.allowPersonalIndicators} className="h-5 w-5" /> Permitir indicadores pessoais (livres)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={a.active} className="h-5 w-5" /> Ativa</label>
      </div>
      <SubmitButton className="btn-primary btn-sm">{a.id ? "Salvar área" : "Adicionar área"}</SubmitButton>
    </ActionForm>
  );
}

export default async function AdminAreas() {
  // Autorização verificada também na página (layouts e páginas renderizam em paralelo)
  await requireAdminPage();
  const areas = await prisma.area.findMany({ include: { _count: { select: { users: true, indicators: true } } }, orderBy: { name: "asc" } });
  return (
    <div className="space-y-4">
      <Card title="Como os pesos funcionam">
        <p className="text-sm text-slate-600">
          A nota de cada período combina o atingimento ponderado dos indicadores da área (peso dos indicadores) com a regularidade de check-in (peso do check-in).
          Ex.: 80/20 significa que 80% da nota vem das metas e 20% da constância nos check-ins. Mudanças de peso afetam o cálculo de todos os períodos, exceto revisões mensais já finalizadas (congeladas).
        </p>
      </Card>
      <Card title="Adicionar área">
        <AreaForm a={{ name: "", description: null, indicatorsWeight: 80, checkinWeight: 20, allowPersonalIndicators: false, active: true }} />
      </Card>
      {areas.map((a) => (
        <Card key={a.id} title={<span>{a.name} {!a.active && <Badge tone="red">inativa</Badge>}</span>} actions={<span className="text-xs text-slate-500">{a._count.users} pessoa(s) · {a._count.indicators} indicador(es)</span>}>
          <AreaForm a={a} />
        </Card>
      ))}
    </div>
  );
}
