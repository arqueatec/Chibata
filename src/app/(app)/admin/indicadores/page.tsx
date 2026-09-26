import { requireAdminPage } from "@/lib/authz";
import { IndicatorForm } from "@/components/IndicatorForm";
import { Badge, Card } from "@/components/ui";
import { prisma } from "@/lib/db";
import { PERIOD_LABEL } from "@/lib/format";

export const metadata = { title: "Administração · Indicadores" };

export default async function AdminIndicators() {
  // Autorização verificada também na página (layouts e páginas renderizam em paralelo)
  await requireAdminPage();
  const [areas, people, indicators] = await Promise.all([
    prisma.area.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.indicator.findMany({ include: { owner: { select: { name: true } } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const groups = [
    ...areas.map((a) => ({ key: a.id, title: a.name, items: indicators.filter((i) => i.areaId === a.id) })),
    ...people
      .map((p) => ({ key: p.id, title: `Pessoais — ${p.name}`, items: indicators.filter((i) => i.ownerId === p.id) }))
      .filter((g) => g.items.length > 0),
  ];
  const empty = { name: "", description: null, unit: "COUNT", direction: "HIGHER_BETTER", aggregation: "SUM", targetValue: 1, targetPeriod: "WEEKLY", weight: 1, sortOrder: 0, active: true, areaId: null, ownerId: null };
  return (
    <div className="space-y-4">
      <Card title="Adicionar indicador">
        <IndicatorForm values={empty} areas={areas} people={people} />
      </Card>
      {groups.map((g) => {
        const totalWeight = g.items.filter((i) => i.active).reduce((s, i) => s + i.weight, 0);
        return (
          <Card key={g.key} title={g.title}>
            {g.items.length === 0 && <p className="text-sm text-slate-500">Nenhum indicador.</p>}
            <ul className="divide-y divide-slate-100">
              {g.items.map((i) => (
                <li key={i.id} className="py-2">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{i.name}</span>
                      <span className="text-slate-500">
                        meta {PERIOD_LABEL[i.targetPeriod]} {i.direction === "LOWER_BETTER" ? "≤ " : ""}{i.targetValue.toLocaleString("pt-BR")}
                      </span>
                      <Badge tone="brand">peso {i.weight} {totalWeight > 0 && i.active ? `(${Math.round((i.weight / totalWeight) * 100)}%)` : ""}</Badge>
                      {!i.active && <Badge tone="red">inativo</Badge>}
                    </summary>
                    <div className="mt-3"><IndicatorForm values={i} areas={areas} people={people} /></div>
                  </details>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
