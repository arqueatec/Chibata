import { requireAdminPage } from "@/lib/authz";
import Link from "next/link";
import { AuditList } from "@/components/AuditList";
import { Card } from "@/components/ui";
import { prisma } from "@/lib/db";
import { ENTITY_LABEL } from "@/lib/format";

export const metadata = { title: "Administração · Auditoria" };

const PAGE = 50;

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ tipo?: string; pessoa?: string; pagina?: string }> }) {
  // Autorização verificada também na página (layouts e páginas renderizam em paralelo)
  await requireAdminPage();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const where = {
    ...(sp.tipo && sp.tipo in ENTITY_LABEL ? { entityType: sp.tipo } : {}),
    ...(sp.pessoa ? { subjectUserId: sp.pessoa } : {}),
  };
  const [rows, total, people] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { name: true } }, subjectUser: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const qs = (p: number) => `/admin/auditoria?${new URLSearchParams({ ...(sp.tipo ? { tipo: sp.tipo } : {}), ...(sp.pessoa ? { pessoa: sp.pessoa } : {}), pagina: String(p) })}`;
  return (
    <Card title={`Trilha de auditoria (${total})`}>
      <form className="mb-3 flex flex-wrap gap-2" action="/admin/auditoria">
        <select name="tipo" defaultValue={sp.tipo ?? ""} className="input !w-auto" aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="pessoa" defaultValue={sp.pessoa ?? ""} className="input !w-auto" aria-label="Pessoa">
          <option value="">Todas as pessoas</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn-secondary btn-sm" type="submit">Filtrar</button>
      </form>
      <AuditList items={rows} showSubject />
      <div className="mt-3 flex justify-between text-sm">
        {page > 1 ? <Link className="link" href={qs(page - 1)}>← Mais recentes</Link> : <span />}
        {page * PAGE < total && <Link className="link" href={qs(page + 1)}>Mais antigos →</Link>}
      </div>
    </Card>
  );
}
