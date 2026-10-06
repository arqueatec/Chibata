import { requireAdminPage } from "@/lib/authz";
import { Card } from "@/components/ui";
import { prisma } from "@/lib/db";
import { addDays, addMonths, endOfMonth, startOfMonth, todayKey } from "@/lib/domain/dates";
import { MAX_EXPORT_DAYS } from "@/lib/services/teamExport";

export const metadata = { title: "Administração · Exportar" };

const SHEETS = [
  "Leia-me (inclui uma sugestão de pedido para o Claude)",
  "Pessoas",
  "Notas semanais e Notas mensais",
  "Detalhe das notas (como cada indicador contribuiu)",
  "Check-ins",
  "Indicadores (lançamentos diários)",
  "Tarefas",
  "Feedbacks",
  "Revisões",
  "Auditoria",
];

export default async function AdminExport() {
  // Autorização verificada também na página (layouts e páginas renderizam em paralelo)
  await requireAdminPage();
  const [areas, people] = await Promise.all([
    prisma.area.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true, active: true }, orderBy: { name: "asc" } }),
  ]);
  const today = todayKey();
  const lastMonth = addMonths(startOfMonth(today), -1);
  const quick = [
    { label: "Mês atual", de: startOfMonth(today), ate: today },
    { label: "Mês passado", de: lastMonth, ate: endOfMonth(lastMonth) },
    { label: "Últimos 30 dias", de: addDays(today, -29), ate: today },
    { label: "Últimos 90 dias", de: addDays(today, -89), ate: today },
  ];
  return (
    <div className="space-y-4">
      <Card title="Exportar dados da equipe (Excel)">
        <p className="mb-4 text-sm text-slate-600">
          Gera uma planilha com uma aba por assunto. Abra no Excel ou envie ao Claude para gerar relatórios e análises.
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {quick.map((q) => (
            <a key={q.label} className="btn-secondary btn-sm" href={`/api/admin/export?de=${q.de}&ate=${q.ate}`}>
              ⬇ {q.label}
            </a>
          ))}
        </div>
        <form action="/api/admin/export" method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="de">De</label>
            <input id="de" name="de" type="date" required defaultValue={startOfMonth(today)} max={today} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="ate">Até</label>
            <input id="ate" name="ate" type="date" required defaultValue={today} max={today} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="area">Área</label>
            <select id="area" name="area" className="input" defaultValue="">
              <option value="">Todas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pessoa">Pessoa</label>
            <select id="pessoa" name="pessoa" className="input" defaultValue="">
              <option value="">Todas</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (inativo)"}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="inativos" value="1" className="h-5 w-5" /> Incluir pessoas inativas
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">⬇ Baixar planilha</button>
            <p className="hint">Período máximo de {MAX_EXPORT_DAYS} dias. Cada exportação fica registrada na auditoria.</p>
          </div>
        </form>
      </Card>
      <Card title="O que vem na planilha">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {SHEETS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          A planilha contém dados pessoais de trabalho da equipe (LGPD): compartilhe apenas com quem precisa. Para exportar somente a trilha de auditoria com filtros, use o botão na aba Auditoria.
        </p>
      </Card>
    </div>
  );
}
