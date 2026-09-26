import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { AuditList } from "@/components/AuditList";
import { FeedbackForm } from "@/components/FeedbackForm";
import { FeedbackList } from "@/components/FeedbackList";
import { ScoreBreakdown } from "@/components/ScoreBreakdown";
import { Badge, Card, PageHeader } from "@/components/ui";
import { reopenReview, saveReview } from "@/app/actions/reviews";
import { requireAccess } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { canReopenReview, canViewUser, canWriteReview, canGiveFeedback } from "@/lib/domain/access";
import { formatPeriodTitle, isDayKey, keyToDate, minKey, periodContaining, todayKey } from "@/lib/domain/dates";
import type { ScoreResult } from "@/lib/domain/scoring";
import { formatDateTime } from "@/lib/format";
import { loadPerformanceData, scoreUser } from "@/lib/services/performance";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string; mes: string }> }) {
  const access = await requireAccess();
  const { id, mes } = await params;
  const monthKey = `${mes}-01`;
  if (!isDayKey(monthKey) || !canViewUser(access.ctx, id)) notFound();
  const person = await prisma.user.findUnique({ where: { id } });
  if (!person) notFound();
  const today = todayKey();
  const period = periodContaining("month", monthKey);
  if (period.start > today) notFound();

  const review = await prisma.monthlyReview.findUnique({
    where: { userId_month: { userId: id, month: keyToDate(period.start) } },
    include: { finalizedBy: { select: { name: true } } },
  });
  const [audits, feedbacks] = await Promise.all([
    review
      ? prisma.auditLog.findMany({ where: { entityType: "MonthlyReview", entityId: review.id }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    prisma.feedback.findMany({
      where: { targetUserId: id, createdAt: { gte: keyToDate(period.start), lt: new Date(keyToDate(period.end).getTime() + 86400_000) } },
      include: { author: { select: { name: true } }, checkIn: { select: { date: true } }, task: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const finalized = review?.status === "FINALIZED";
  const live = finalized
    ? null
    : scoreUser(await loadPerformanceData([id], period.start, period.end), id, period, minKey(period.end, today));
  const breakdown = (finalized ? (review?.breakdown as unknown as ScoreResult | null) : live) ?? null;
  const writable = canWriteReview(access.ctx, id) && !finalized;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={`Revisão mensal — ${person.name}`}
        subtitle={formatPeriodTitle(period)}
        actions={
          <>
            <Badge tone={finalized ? "green" : review ? "yellow" : "gray"}>{finalized ? "Finalizada" : review ? "Rascunho" : "Não iniciada"}</Badge>
            <Link href={`/pessoas/${id}`} className="btn-secondary btn-sm">Voltar ao perfil</Link>
          </>
        }
      />

      {finalized && review && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Finalizada por {review.finalizedBy?.name ?? "—"} em {review.finalizedAt ? formatDateTime(review.finalizedAt) : "—"}. A nota abaixo foi congelada na finalização.
          Somente o administrador pode reabrir, com justificativa.
        </div>
      )}

      <Card title={finalized ? "Nota congelada do mês" : "Nota do mês (calculada ao vivo)"}>
        {breakdown ? <ScoreBreakdown result={breakdown} /> : <p className="text-sm text-slate-500">Revisão finalizada sem detalhamento de nota.</p>}
      </Card>

      <Card title="Avaliação">
        {writable ? (
          <ActionForm action={saveReview}>
            <input type="hidden" name="userId" value={id} />
            <input type="hidden" name="month" value={period.start} />
            <ReviewFields review={review} />
            <div className="flex flex-wrap gap-2">
              <SubmitButton className="btn-secondary" name="intent" value="save">Salvar rascunho</SubmitButton>
              <SubmitButton className="btn-primary" name="intent" value="finalize" pendingText="Processando…">Finalizar revisão</SubmitButton>
            </div>
          </ActionForm>
        ) : review ? (
          <dl className="space-y-3 text-sm">
            <div><dt className="font-semibold">Resumo</dt><dd className="whitespace-pre-wrap">{review.summary || "—"}</dd></div>
            <div><dt className="font-semibold">Pontos fortes</dt><dd className="whitespace-pre-wrap">{review.strengths || "—"}</dd></div>
            <div><dt className="font-semibold">Pontos a desenvolver</dt><dd className="whitespace-pre-wrap">{review.improvements || "—"}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-slate-500">A revisão deste mês ainda não foi iniciada.</p>
        )}
      </Card>

      {finalized && review && canReopenReview(access.ctx) && (
        <Card title="Reabrir revisão (administrador)">
          <ActionForm action={reopenReview} confirm="Reabrir esta revisão finalizada?">
            <input type="hidden" name="id" value={review.id} />
            <label className="label" htmlFor="reason">Justificativa (obrigatória, fica registrada na auditoria)</label>
            <textarea id="reason" name="reason" required minLength={10} maxLength={1000} rows={2} className="input" />
            <SubmitButton className="btn-danger" pendingText="Reabrindo…">Reabrir revisão</SubmitButton>
          </ActionForm>
        </Card>
      )}

      <Card title="Feedbacks do mês">
        {canGiveFeedback(access.ctx, id) && (
          <div className="mb-4">
            <FeedbackForm targetUserId={id} periodType="MONTH" periodStart={period.start} compact />
          </div>
        )}
        <FeedbackList items={feedbacks} />
      </Card>

      {audits.length > 0 && (
        <Card title="Histórico da revisão">
          <AuditList items={audits} />
        </Card>
      )}
    </div>
  );
}

function ReviewFields({ review }: { review: { summary: string; strengths: string; improvements: string } | null }) {
  return (
    <>
      <div>
        <label className="label" htmlFor="summary">Resumo do mês</label>
        <textarea id="summary" name="summary" rows={3} maxLength={4000} defaultValue={review?.summary} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="strengths">Pontos fortes</label>
        <textarea id="strengths" name="strengths" rows={2} maxLength={4000} defaultValue={review?.strengths} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="improvements">Pontos a desenvolver</label>
        <textarea id="improvements" name="improvements" rows={2} maxLength={4000} defaultValue={review?.improvements} className="input" />
      </div>
    </>
  );
}
