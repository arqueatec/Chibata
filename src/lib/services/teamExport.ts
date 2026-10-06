import "server-only";
import { prisma } from "@/lib/db";
import {
  addDays,
  dateToKey,
  formatDay,
  keyToDate,
  minKey,
  nextPeriod,
  periodContaining,
  todayKey,
  type DayKey,
  type Period,
  type PeriodKind,
} from "@/lib/domain/dates";
import { PERIOD_LABEL, ROLE_LABEL, STATUS_LABEL, UNIT_LABEL } from "@/lib/format";
import { auditSheet } from "./auditExport";
import { excelLocal, startOfDayInTz, FMT_DATE, FMT_DATETIME, FMT_NUM, FMT_SCORE, type SheetSpec } from "./excel";
import { loadPerformanceData, scoreUser } from "./performance";

export const MAX_EXPORT_DAYS = 400;

/** Períodos (semanas ou meses) que se sobrepõem ao intervalo. */
export function periodsOverlapping(kind: PeriodKind, from: DayKey, to: DayKey): Period[] {
  const out: Period[] = [];
  for (let p = periodContaining(kind, from); p.start <= to; p = nextPeriod(p)) out.push(p);
  return out;
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : v / 100);

export async function buildTeamExport(params: { from: DayKey; to: DayKey; userIds: string[]; generatedBy: string }) {
  const { from, to, userIds } = params;
  const today = todayKey();
  const fromDate = keyToDate(from);
  const toDate = keyToDate(to);
  // Para campos de data-hora (criação, feedbacks, auditoria), os limites seguem o fuso do app
  const fromInstant = startOfDayInTz(from);
  const toExclusive = startOfDayInTz(addDays(to, 1));

  const weeks = periodsOverlapping("week", from, to);
  const months = periodsOverlapping("month", from, to);
  const perfFrom = weeks[0].start < months[0].start ? weeks[0].start : months[0].start;
  const perfTo = minKey(today, weeks.at(-1)!.end > months.at(-1)!.end ? weeks.at(-1)!.end : months.at(-1)!.end);

  const [users, perf, checkIns, entries, tasks, feedbacks, reviews] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      include: { area: true, manager: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    loadPerformanceData(userIds, perfFrom, perfTo),
    prisma.checkIn.findMany({
      where: { userId: { in: userIds }, date: { gte: fromDate, lte: toDate } },
      include: { user: { select: { name: true, area: { select: { name: true } } } } },
      orderBy: [{ date: "asc" }, { user: { name: "asc" } }],
    }),
    prisma.indicatorEntry.findMany({
      where: { userId: { in: userIds }, date: { gte: fromDate, lte: toDate } },
      include: { user: { select: { name: true } }, indicator: { select: { name: true, unit: true, targetValue: true, targetPeriod: true, direction: true } } },
      orderBy: [{ date: "asc" }],
    }),
    prisma.task.findMany({
      where: {
        assigneeId: { in: userIds },
        createdAt: { lt: toExclusive },
        OR: [{ status: { not: "DONE" } }, { completedAt: { gte: fromInstant } }],
      },
      include: {
        assignee: { select: { name: true } },
        createdBy: { select: { name: true } },
        project: { select: { name: true, kind: true } },
        parent: { select: { title: true } },
      },
      orderBy: [{ assignee: { name: "asc" } }, { dueDate: "asc" }],
    }),
    prisma.feedback.findMany({
      where: { targetUserId: { in: userIds }, createdAt: { gte: fromInstant, lt: toExclusive } },
      include: { author: { select: { name: true } }, targetUser: { select: { name: true } }, checkIn: { select: { date: true } }, task: { select: { title: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.monthlyReview.findMany({
      where: { userId: { in: userIds }, month: { gte: keyToDate(months[0].start), lte: toDate } },
      include: { user: { select: { name: true } }, finalizedBy: { select: { name: true } } },
      orderBy: [{ month: "asc" }],
    }),
  ]);

  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const areaOf = new Map(users.map((u) => [u.id, u.area?.name ?? ""]));

  // Notas e detalhamento
  const scoreRows = (periods: Period[]) =>
    periods.flatMap((p) =>
      userIds.map((id) => {
        const r = scoreUser(perf, id, p, minKey(p.end, today));
        return {
          pessoa: nameOf.get(id),
          area: areaOf.get(id),
          inicio: keyToDate(p.start),
          fim: keyToDate(p.end),
          emAndamento: p.end >= today ? "sim" : "não",
          nota: r?.score ?? null,
          meta: pct(r?.goalAttainment),
          checkins: r?.checkinsDone ?? null,
          diasUteis: r?.countedBusinessDays ?? null,
          regularidade: pct(r?.checkinRate),
        };
      }),
    );
  const scoreColumns = [
    { header: "Pessoa", key: "pessoa", width: 14 },
    { header: "Área", key: "area", width: 26 },
    { header: "Início", key: "inicio", width: 12, numFmt: FMT_DATE },
    { header: "Fim", key: "fim", width: 12, numFmt: FMT_DATE },
    { header: "Em andamento", key: "emAndamento", width: 13 },
    { header: "Nota (0-100)", key: "nota", width: 12, numFmt: FMT_SCORE },
    { header: "% da meta", key: "meta", width: 11, numFmt: "0.0%" },
    { header: "Check-ins feitos", key: "checkins", width: 15 },
    { header: "Dias úteis considerados", key: "diasUteis", width: 21 },
    { header: "Regularidade", key: "regularidade", width: 13, numFmt: "0.0%" },
  ];

  const detailRows: Record<string, unknown>[] = [];
  for (const [kind, periods] of [["Semana", weeks], ["Mês", months]] as const) {
    for (const p of periods) {
      for (const id of userIds) {
        const r = scoreUser(perf, id, p, minKey(p.end, today));
        if (!r || r.score === null) continue;
        const base = { pessoa: nameOf.get(id), area: areaOf.get(id), tipo: kind, inicio: keyToDate(p.start) };
        for (const i of r.indicators) {
          detailRows.push({
            ...base,
            indicador: i.name,
            sentido: i.direction === "LOWER_BETTER" ? "menor é melhor" : "maior é melhor",
            realizado: i.actual,
            meta: i.target,
            atingimentoBruto: i.rawAttainment,
            atingimento: i.attainment,
            peso: i.normalizedWeight * (r.effectiveIndicatorsWeight / 100),
            pontos: i.contribution,
            explicacao: i.explanation,
          });
        }
        detailRows.push({
          ...base,
          indicador: "Regularidade de check-in",
          sentido: "maior é melhor",
          realizado: r.checkinsDone,
          meta: r.countedBusinessDays,
          atingimentoBruto: pct(r.checkinRate),
          atingimento: pct(r.checkinRate),
          peso: r.effectiveCheckinWeight / 100,
          pontos: r.checkinContribution,
          explicacao: `${r.checkinsDone} check-ins em ${r.countedBusinessDays} dias úteis`,
        });
        detailRows.push({ ...base, indicador: "= NOTA DO PERÍODO", pontos: r.score });
      }
    }
  }

  const sheets: SheetSpec[] = [
    {
      name: "Leia-me",
      columns: [
        { header: "Item", key: "k", width: 26 },
        { header: "Descrição", key: "v", width: 110, wrap: true },
      ],
      rows: [
        { k: "Relatório", v: "Exportação de acompanhamento de desempenho — ArqueaTec" },
        { k: "Período", v: `${formatDay(from)} a ${formatDay(to)}` },
        { k: "Pessoas", v: users.map((u) => u.name).join(", ") },
        { k: "Gerado por / em", v: `${params.generatedBy} — ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: process.env.APP_TIMEZONE || "America/Sao_Paulo" }).format(new Date())}` },
        { k: "Pessoas", v: "Cadastro: área, função, perfil de acesso e liderança." },
        { k: "Notas semanais / mensais", v: "Nota consolidada (0-100) de cada semana e mês que se sobrepõe ao período. Nota = peso dos indicadores × % da meta + peso do check-in × regularidade. Períodos em andamento consideram só os dias úteis até hoje." },
        { k: "Detalhe das notas", v: "Como cada indicador contribuiu: realizado, meta do período, atingimento (limitado a 100% na nota), peso efetivo e pontos. A soma dos pontos de cada pessoa/período é a nota." },
        { k: "Check-ins", v: "O que foi feito, plano do dia, bloqueios, pedido de ajuda, resolução e autoavaliação (1-5)." },
        { k: "Indicadores (diário)", v: "Valores lançados em cada dia, com a meta configurada." },
        { k: "Tarefas", v: "Metas e tarefas ativas no período (abertas ou concluídas dentro dele), com prazo, status e atraso." },
        { k: "Feedbacks / Revisões", v: "Comentários e reconhecimentos registrados no período; revisões mensais com status e nota congelada." },
        { k: "Auditoria", v: "Uma linha por campo alterado: quem, quando, valor anterior e novo, justificativa." },
        {
          k: "Sugestão de uso no Claude",
          v: "Envie esta planilha ao Claude e peça, por exemplo: \"Com base nesta planilha, escreva um relatório de desempenho da equipe no período: destaques por pessoa, tendência das notas, bloqueios recorrentes e o que precisa de ajuda, tarefas atrasadas e sugestões para as conversas de revisão. Compare pessoas apenas dentro da mesma área ou pelo % da meta.\"",
        },
        { k: "Privacidade (LGPD)", v: "Contém dados pessoais de trabalho da equipe. Compartilhe apenas com quem precisa e apague cópias que não forem mais necessárias." },
      ],
    },
    {
      name: "Pessoas",
      columns: [
        { header: "Nome", key: "nome", width: 14 },
        { header: "E-mail", key: "email", width: 30 },
        { header: "Área", key: "area", width: 28 },
        { header: "Função", key: "funcao", width: 30 },
        { header: "Perfil", key: "perfil", width: 16 },
        { header: "Liderado(a) por", key: "lider", width: 16 },
        { header: "Ativo", key: "ativo", width: 8 },
      ],
      rows: users.map((u) => ({
        nome: u.name,
        email: u.email,
        area: u.area?.name ?? "",
        funcao: u.jobTitle ?? "",
        perfil: ROLE_LABEL[u.role],
        lider: u.manager?.name ?? "",
        ativo: u.active ? "sim" : "não",
      })),
    },
    { name: "Notas semanais", columns: scoreColumns, rows: scoreRows(weeks) },
    { name: "Notas mensais", columns: scoreColumns, rows: scoreRows(months) },
    {
      name: "Detalhe das notas",
      columns: [
        { header: "Pessoa", key: "pessoa", width: 14 },
        { header: "Área", key: "area", width: 24 },
        { header: "Período", key: "tipo", width: 9 },
        { header: "Início", key: "inicio", width: 12, numFmt: FMT_DATE },
        { header: "Indicador", key: "indicador", width: 30 },
        { header: "Sentido", key: "sentido", width: 15 },
        { header: "Realizado", key: "realizado", width: 11, numFmt: FMT_NUM },
        { header: "Meta no período", key: "meta", width: 14, numFmt: FMT_NUM },
        { header: "Atingimento bruto", key: "atingimentoBruto", width: 16, numFmt: "0.0%" },
        { header: "Atingimento na nota", key: "atingimento", width: 17, numFmt: "0.0%" },
        { header: "Peso na nota", key: "peso", width: 12, numFmt: "0.0%" },
        { header: "Pontos", key: "pontos", width: 9, numFmt: FMT_SCORE },
        { header: "Explicação", key: "explicacao", width: 70 },
      ],
      rows: detailRows,
    },
    {
      name: "Check-ins",
      columns: [
        { header: "Data", key: "data", width: 11, numFmt: FMT_DATE },
        { header: "Pessoa", key: "pessoa", width: 13 },
        { header: "Área", key: "area", width: 24 },
        { header: "O que foi feito", key: "feito", width: 50, wrap: true },
        { header: "Plano do dia", key: "plano", width: 50, wrap: true },
        { header: "Bloqueios", key: "bloqueios", width: 40, wrap: true },
        { header: "Pediu ajuda", key: "ajuda", width: 11 },
        { header: "Bloqueio resolvido em", key: "resolvido", width: 19, numFmt: FMT_DATETIME },
        { header: "Autoavaliação (1-5)", key: "auto", width: 17 },
        { header: "Registrado em", key: "registrado", width: 17, numFmt: FMT_DATETIME },
        { header: "Última edição", key: "editado", width: 17, numFmt: FMT_DATETIME },
      ],
      rows: checkIns.map((c) => ({
        data: c.date,
        pessoa: c.user.name,
        area: c.user.area?.name ?? "",
        feito: c.yesterday,
        plano: c.today,
        bloqueios: c.blockers ?? "",
        ajuda: c.needsHelp ? "sim" : "",
        resolvido: excelLocal(c.blockerResolvedAt),
        auto: c.selfScore,
        registrado: excelLocal(c.createdAt),
        editado: excelLocal(c.updatedAt),
      })),
    },
    {
      name: "Indicadores (diário)",
      columns: [
        { header: "Data", key: "data", width: 11, numFmt: FMT_DATE },
        { header: "Pessoa", key: "pessoa", width: 13 },
        { header: "Indicador", key: "indicador", width: 32 },
        { header: "Valor", key: "valor", width: 12, numFmt: FMT_NUM },
        { header: "Unidade", key: "unidade", width: 11 },
        { header: "Meta configurada", key: "meta", width: 15, numFmt: FMT_NUM },
        { header: "Período da meta", key: "periodo", width: 15 },
        { header: "Sentido", key: "sentido", width: 15 },
      ],
      rows: entries.map((e) => ({
        data: e.date,
        pessoa: e.user.name,
        indicador: e.indicator.name,
        valor: e.value,
        unidade: UNIT_LABEL[e.indicator.unit],
        meta: e.indicator.targetValue,
        periodo: PERIOD_LABEL[e.indicator.targetPeriod],
        sentido: e.indicator.direction === "LOWER_BETTER" ? "menor é melhor" : "maior é melhor",
      })),
    },
    {
      name: "Tarefas",
      columns: [
        { header: "Tipo", key: "tipo", width: 8 },
        { header: "Título", key: "titulo", width: 44, wrap: true },
        { header: "Responsável", key: "responsavel", width: 13 },
        { header: "Status", key: "status", width: 13 },
        { header: "Prazo", key: "prazo", width: 11, numFmt: FMT_DATE },
        { header: "Atrasada (no fim do período)", key: "atrasada", width: 14 },
        { header: "Concluída em", key: "concluida", width: 17, numFmt: FMT_DATETIME },
        { header: "Motivo do bloqueio", key: "bloqueio", width: 34, wrap: true },
        { header: "Projeto/cliente", key: "projeto", width: 26 },
        { header: "Meta vinculada", key: "metaMae", width: 30 },
        { header: "Criada por", key: "criador", width: 13 },
        { header: "Criada em", key: "criada", width: 17, numFmt: FMT_DATETIME },
      ],
      rows: tasks.map((t) => {
        const due = t.dueDate ? dateToKey(t.dueDate) : null;
        const ref = minKey(to, today);
        const doneBy = t.completedAt ? dateToKey(excelLocal(t.completedAt)!) : null;
        const late = !!due && due < ref && (!doneBy || doneBy > due);
        return {
          tipo: t.kind === "GOAL" ? "Meta" : "Tarefa",
          titulo: t.title,
          responsavel: t.assignee.name,
          status: STATUS_LABEL[t.status],
          prazo: t.dueDate,
          atrasada: late ? "sim" : "",
          concluida: excelLocal(t.completedAt),
          bloqueio: t.blockedReason ?? "",
          projeto: t.project ? `${t.project.kind === "CLIENT" ? "Cliente" : "Projeto"}: ${t.project.name}` : "",
          metaMae: t.parent?.title ?? "",
          criador: t.createdBy.name,
          criada: excelLocal(t.createdAt),
        };
      }),
    },
    {
      name: "Feedbacks",
      columns: [
        { header: "Data", key: "data", width: 17, numFmt: FMT_DATETIME },
        { header: "Para", key: "para", width: 13 },
        { header: "De", key: "de", width: 13 },
        { header: "Tipo", key: "tipo", width: 15 },
        { header: "Feedback", key: "texto", width: 70, wrap: true },
        { header: "Vinculado a", key: "vinculo", width: 40 },
      ],
      rows: feedbacks.map((f) => ({
        data: excelLocal(f.createdAt),
        para: f.targetUser.name,
        de: f.author.name,
        tipo: f.kind === "RECOGNITION" ? "Reconhecimento" : "Comentário",
        texto: f.body,
        vinculo: f.checkIn
          ? `Dia ${formatDay(dateToKey(f.checkIn.date))}`
          : f.task
            ? `Tarefa: ${f.task.title}`
            : f.periodType && f.periodStart
              ? `${f.periodType === "WEEK" ? "Semana" : "Mês"} de ${formatDay(dateToKey(f.periodStart))}`
              : "",
      })),
    },
    {
      name: "Revisões",
      columns: [
        { header: "Pessoa", key: "pessoa", width: 13 },
        { header: "Mês", key: "mes", width: 11, numFmt: "mm/yyyy" },
        { header: "Status", key: "status", width: 12 },
        { header: "Nota congelada", key: "nota", width: 14, numFmt: FMT_SCORE },
        { header: "Resumo", key: "resumo", width: 50, wrap: true },
        { header: "Pontos fortes", key: "fortes", width: 40, wrap: true },
        { header: "Pontos a desenvolver", key: "desenvolver", width: 40, wrap: true },
        { header: "Finalizada por", key: "por", width: 14 },
        { header: "Finalizada em", key: "em", width: 17, numFmt: FMT_DATETIME },
      ],
      rows: reviews.map((r) => ({
        pessoa: r.user.name,
        mes: r.month,
        status: r.status === "FINALIZED" ? "Finalizada" : "Rascunho",
        nota: r.finalScore,
        resumo: r.summary,
        fortes: r.strengths,
        desenvolver: r.improvements,
        por: r.finalizedBy?.name ?? "",
        em: excelLocal(r.finalizedAt),
      })),
    },
    await auditSheet({ subjectUserIds: userIds, from: fromInstant, to: toExclusive }),
  ];
  return sheets;
}
