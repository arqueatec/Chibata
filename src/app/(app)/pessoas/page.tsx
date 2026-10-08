import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, PageHeader, ScorePill } from "@/components/ui";
import { requireAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { periodContaining, todayKey } from "@/lib/domain/dates";
import { ROLE_LABEL } from "@/lib/format";
import { loadPerformanceData, scoreUser } from "@/lib/services/performance";

export const metadata = { title: "Pessoas" };

export default async function PeoplePage() {
  const access = await requireAccess();
  if (access.visible && access.visible.size <= 1) redirect(`/pessoas/${access.user.id}`);
  const people = await prisma.user.findMany({
    where: { id: access.visible ? { in: [...access.visible] } : undefined },
    include: { area: true, manager: { select: { name: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  const today = todayKey();
  const month = periodContaining("month", today);
  const week = periodContaining("week", today);
  const perf = await loadPerformanceData(people.map((p) => p.id), month.start < week.start ? month.start : week.start, today);

  return (
    <div>
      <PageHeader title="Pessoas" subtitle={access.isAdmin ? "Toda a equipe" : "Você e sua equipe"} actions={access.isAdmin && <Link href="/admin/pessoas" className="btn-secondary btn-sm">Gerenciar pessoas</Link>} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((p) => (
          <Link key={p.id} href={`/pessoas/${p.id}`} className="card block transition hover:border-accent-600">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{p.name} {!p.active && <Badge>inativo</Badge>}</div>
                <div className="text-xs text-slate-500">{p.jobTitle ?? p.area?.name} · {ROLE_LABEL[p.role]}</div>
                {p.manager && <div className="text-xs text-slate-500">reporta a {p.manager.name}</div>}
              </div>
              <div className="text-right text-xs text-slate-500">
                <div>semana <ScorePill value={scoreUser(perf, p.id, week, today)?.score} /></div>
                <div className="mt-1">mês <ScorePill value={scoreUser(perf, p.id, month, today)?.score} /></div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
