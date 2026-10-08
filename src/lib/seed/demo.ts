/**
 * Dados de demonstração: 6 pessoas, áreas, indicadores e 60 dias de check-ins fictícios
 * com variações realistas (dias bons, bloqueios, faltas de check-in, fins de semana sem registro).
 * Usado por `npm run db:seed` (APAGA os dados existentes!) e pela página /setup (banco vazio).
 */
import type { Aggregation, Direction, IndicatorUnit, PrismaClient, Prisma, TargetPeriod } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, addMonths, isBusinessDay, keyToDate, startOfMonth, todayKey, weekday, type DayKey } from "../domain/dates";


// PRNG determinístico (mulberry32) para dados reprodutíveis
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = rng(20260927);
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const poisson = (lambda: number) => {
  // Knuth
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
};

type IndDef = {
  name: string;
  unit?: IndicatorUnit;
  direction?: Direction;
  aggregation?: Aggregation;
  targetValue: number;
  targetPeriod: TargetPeriod;
  weight: number;
  /** média diária esperada quando a pessoa está em ritmo "normal" (fator 1) */
  daily: number;
};

const AREAS: {
  key: string;
  name: string;
  description: string;
  allowPersonal?: boolean;
  indicators: IndDef[];
  done: string[];
  plan: string[];
  blockers: string[];
}[] = [
  {
    key: "direcao",
    name: "Direção",
    description: "CEO — atua em todas as áreas. Indicadores livres, configurados pelo próprio usuário.",
    allowPersonal: true,
    indicators: [],
    done: ["Reunião com investidor-anjo sobre a rodada seed", "Revisão do pipeline comercial com o Fernando", "Alinhamento do cronograma de P&D com a Brenda", "Revisão da proposta do edital com o Junior", "Conversa com a Ilaria sobre a coorte do FTH", "Análise do fluxo de caixa do trimestre", "Entrevista com candidato a engenheiro de processos"],
    plan: ["Preparar deck para investidores", "Reunião de board", "Revisar contratos com fornecedores", "Visitar laboratório parceiro", "Fechar metas do próximo mês com a equipe", "Call com potencial cliente estratégico"],
    blockers: ["Aguardando retorno do jurídico sobre o acordo de acionistas", "Documentação contábil atrasada para a due diligence"],
  },
  {
    key: "vendas",
    name: "Vendas",
    description: "Prospecção, relacionamento e fechamento de negócios.",
    indicators: [
      { name: "Contatos realizados", targetValue: 8, targetPeriod: "DAILY", weight: 2, daily: 8 },
      { name: "Reuniões agendadas", targetValue: 5, targetPeriod: "WEEKLY", weight: 3, daily: 1 },
      { name: "Propostas enviadas", targetValue: 2, targetPeriod: "WEEKLY", weight: 3, daily: 0.4 },
      { name: "Valor em pipeline", unit: "CURRENCY", aggregation: "LAST", targetValue: 500000, targetPeriod: "MONTHLY", weight: 1, daily: 0 },
      { name: "Negócios fechados", targetValue: 2, targetPeriod: "MONTHLY", weight: 4, daily: 0.09 },
    ],
    done: ["Ligações de prospecção para indústrias de alimentos", "Reunião de descoberta com a Minerva Materiais", "Envio de proposta técnica-comercial para a BioAgro Sul", "Follow-up com leads do evento de inovação", "Atualização do CRM", "Demo do produto para cliente do setor químico"],
    plan: ["Follow-up das propostas em aberto", "Prospecção no setor de mineração", "Preparar proposta para a Minerva Materiais", "Reunião de negociação com a BioAgro Sul", "Mapear decisores em 5 contas-alvo"],
    blockers: ["Preciso de ficha técnica atualizada da Brenda para fechar a proposta", "Cliente pediu desconto acima da minha alçada — preciso de aprovação do Yago", "Aguardando laudo de amostra para enviar ao cliente"],
  },
  {
    key: "producao",
    name: "Produção e Pesquisa",
    description: "Experimentos, lotes piloto, testes de amostras e documentação técnica.",
    indicators: [
      { name: "Experimentos/lotes realizados", targetValue: 4, targetPeriod: "WEEKLY", weight: 3, daily: 0.8 },
      { name: "Amostras testadas", targetValue: 20, targetPeriod: "WEEKLY", weight: 2, daily: 4 },
      { name: "Resultados documentados", targetValue: 3, targetPeriod: "WEEKLY", weight: 2, daily: 0.6 },
      { name: "Não conformidades", direction: "LOWER_BETTER", targetValue: 2, targetPeriod: "MONTHLY", weight: 1, daily: 0.08 },
    ],
    done: ["Lote piloto 14 do biorreator concluído", "Testes de resistência em 6 amostras", "Documentação do protocolo de síntese v3", "Calibração do espectrofotômetro", "Análise dos resultados do lote 13", "Preparação de amostras para cliente"],
    plan: ["Iniciar lote piloto 15", "Testar amostras da nova formulação", "Redigir relatório técnico do trimestre", "Manutenção preventiva do reator", "Enviar amostras para laboratório externo"],
    blockers: ["Reagente em falta — pedido de compra aguardando aprovação", "Equipamento de análise térmica em manutenção", "Preciso de ajuda para interpretar resultados inesperados do lote 14"],
  },
  {
    key: "projetos",
    name: "Escrita de Projetos",
    description: "Mapeamento de editais e redação de propostas de fomento.",
    indicators: [
      { name: "Editais mapeados", targetValue: 3, targetPeriod: "WEEKLY", weight: 1, daily: 0.6 },
      { name: "Seções redigidas", targetValue: 6, targetPeriod: "WEEKLY", weight: 3, daily: 1.2 },
      { name: "Propostas submetidas", targetValue: 2, targetPeriod: "MONTHLY", weight: 3, daily: 0.09 },
      { name: "Prazos cumpridos", targetValue: 2, targetPeriod: "MONTHLY", weight: 2, daily: 0.09 },
      { name: "Projetos aprovados", targetValue: 1, targetPeriod: "MONTHLY", weight: 1, daily: 0.03 },
    ],
    done: ["Redação da seção de metodologia do edital de fomento deep tech", "Mapeamento de editais abertos de agências estaduais", "Revisão do orçamento da proposta", "Montagem do cronograma físico-financeiro", "Submissão da proposta no sistema da agência", "Coleta de cartas de anuência dos parceiros"],
    plan: ["Redigir seção de impacto e resultados esperados", "Revisar proposta com o Yago", "Preparar documentação institucional", "Mapear chamadas internacionais", "Ajustar orçamento conforme regras do edital"],
    blockers: ["Aguardando dados de resultados da Brenda para a seção técnica", "Sistema da agência instável, não consegui submeter", "Falta certidão negativa atualizada da empresa"],
  },
  {
    key: "fth",
    name: "Coordenação Frontier Tech Hub",
    description: "Coordenação do programa Frontier Tech Hub: entregáveis, coaches, parceiros e relatórios.",
    indicators: [
      { name: "Entregáveis do programa", targetValue: 3, targetPeriod: "WEEKLY", weight: 3, daily: 0.6 },
      { name: "Reuniões com coaches/parceiros", targetValue: 4, targetPeriod: "WEEKLY", weight: 2, daily: 0.8 },
      { name: "Pendências resolvidas", targetValue: 5, targetPeriod: "WEEKLY", weight: 2, daily: 1 },
      { name: "Relatórios enviados", targetValue: 2, targetPeriod: "MONTHLY", weight: 2, daily: 0.09 },
    ],
    done: ["Mentoria com coach de go-to-market", "Consolidação do relatório mensal da coorte", "Reunião com parceiro institucional do programa", "Organização do demo day", "Acompanhamento dos marcos das startups", "Alinhamento semanal com o Natan"],
    plan: ["Preparar pauta do comitê do programa", "Enviar relatório ao financiador", "Agendar sessões de mentoria da semana", "Revisar entregáveis das startups", "Reunião com novos coaches"],
    blockers: ["Financiador ainda não validou o modelo de relatório", "Coach cancelou sessão e preciso de substituto", "Pendência de assinatura de termo com parceiro"],
  },
  {
    key: "assistencia",
    name: "Assistência FTH",
    description: "Apoio operacional à coordenação do Frontier Tech Hub.",
    indicators: [
      { name: "Tarefas concluídas", targetValue: 12, targetPeriod: "WEEKLY", weight: 3, daily: 2.4 },
      { name: "Tarefas atrasadas", direction: "LOWER_BETTER", targetValue: 1, targetPeriod: "WEEKLY", weight: 2, daily: 0.2 },
      { name: "Demandas atendidas", targetValue: 10, targetPeriod: "WEEKLY", weight: 2, daily: 2 },
    ],
    done: ["Organização da agenda de mentorias", "Atualização da planilha de acompanhamento das startups", "Envio de convites para o workshop", "Compilação das atas de reunião", "Suporte logístico ao evento", "Atendimento a dúvidas das startups"],
    plan: ["Enviar lembretes de entregáveis", "Preparar materiais do workshop", "Atualizar base de contatos de coaches", "Organizar documentos para o relatório", "Reservar sala para o demo day"],
    blockers: ["Sem acesso à pasta compartilhada do financiador", "Preciso da validação da Ilaria para enviar o comunicado"],
  },
];

const PEOPLE = [
  { key: "yago", name: "Yago", email: "yago@arqueatec.com.br", role: "ADMIN" as const, jobTitle: "CEO", area: "direcao", manager: null, reliability: 0.8, perf: (t: number) => 1 },
  { key: "fernando", name: "Fernando", email: "fernando@arqueatec.com.br", role: "COLLABORATOR" as const, jobTitle: "Vendas", area: "vendas", manager: "yago", reliability: 0.9, perf: (t: number) => 0.7 + 0.45 * t },
  { key: "brenda", name: "Brenda", email: "brenda@arqueatec.com.br", role: "COLLABORATOR" as const, jobTitle: "Produção e Pesquisa", area: "producao", manager: "yago", reliability: 0.95, perf: (t: number) => 1.05 },
  { key: "junior", name: "Junior", email: "junior@arqueatec.com.br", role: "COLLABORATOR" as const, jobTitle: "Escrita de Projetos", area: "projetos", manager: "yago", reliability: 0.78, perf: (t: number) => 1.1 - 0.4 * t },
  { key: "ilaria", name: "Ilaria", email: "ilaria@arqueatec.com.br", role: "COORDINATOR" as const, jobTitle: "Coordenadora do Frontier Tech Hub", area: "fth", manager: "yago", reliability: 0.92, perf: (t: number) => 0.95 },
  { key: "natan", name: "Natan", email: "natan@arqueatec.com.br", role: "COLLABORATOR" as const, jobTitle: "Assistente do Frontier Tech Hub", area: "assistencia", manager: "ilaria", reliability: 0.86, perf: (t: number) => 0.85 + 0.2 * Math.sin(t * 6) },
];

const CEO_INDICATORS: IndDef[] = [
  { name: "Reuniões com investidores", targetValue: 2, targetPeriod: "WEEKLY", weight: 2, daily: 0.5 },
  { name: "Decisões estratégicas registradas", targetValue: 3, targetPeriod: "WEEKLY", weight: 1, daily: 0.7 },
  { name: "Horas de 1:1 com a equipe", unit: "HOURS", targetValue: 5, targetPeriod: "WEEKLY", weight: 1, daily: 1 },
];

const DAYS = 60;

export async function seedDemo(prisma: PrismaClient, opts: { password: string; log?: (msg: string) => void }) {
  const console = { log: opts.log ?? (() => {}) };
  rand = rng(20260927);
  const today = todayKey();
  const firstDay = addDays(today, -DAYS + 1);
  const password = opts.password;
  const passwordHash = await bcrypt.hash(password, 11);

  console.log("Limpando dados…");
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.integrationSetting.deleteMany(),
    prisma.taskFieldChange.deleteMany(),
    prisma.crmEvent.deleteMany(),
    prisma.crmAccount.deleteMany(),
    prisma.grant.deleteMany(),
    prisma.feedback.deleteMany(),
    prisma.monthlyReview.deleteMany(),
    prisma.task.updateMany({ data: { parentId: null } }),
    prisma.task.deleteMany(),
    prisma.project.deleteMany(),
    prisma.indicatorEntry.deleteMany(),
    prisma.checkIn.deleteMany(),
    prisma.indicator.deleteMany(),
    prisma.session.deleteMany(),
    prisma.magicLinkToken.deleteMany(),
    prisma.user.updateMany({ data: { managerId: null } }),
    prisma.user.deleteMany(),
    prisma.area.deleteMany(),
  ]);

  console.log("Criando áreas e indicadores…");
  const areaIds: Record<string, string> = {};
  const indicatorsByArea: Record<string, { id: string; def: IndDef }[]> = {};
  for (const a of AREAS) {
    const area = await prisma.area.create({
      data: { name: a.name, description: a.description, allowPersonalIndicators: !!a.allowPersonal },
    });
    areaIds[a.key] = area.id;
    indicatorsByArea[a.key] = [];
    for (const [i, def] of a.indicators.entries()) {
      const ind = await prisma.indicator.create({
        data: {
          name: def.name,
          unit: def.unit ?? "COUNT",
          direction: def.direction ?? "HIGHER_BETTER",
          aggregation: def.aggregation ?? "SUM",
          targetValue: def.targetValue,
          targetPeriod: def.targetPeriod,
          weight: def.weight,
          sortOrder: i,
          areaId: area.id,
        },
      });
      indicatorsByArea[a.key].push({ id: ind.id, def });
    }
  }

  console.log("Criando pessoas…");
  const userIds: Record<string, string> = {};
  const createdAt = keyToDate(firstDay); // início dos dados de demonstração
  for (const p of PEOPLE) {
    const u = await prisma.user.create({
      data: {
        name: p.name,
        email: p.email,
        role: p.role,
        jobTitle: p.jobTitle,
        areaId: areaIds[p.area],
        passwordHash,
        reminderEnabled: p.key !== "yago",
        createdAt,
      },
    });
    userIds[p.key] = u.id;
  }
  for (const p of PEOPLE) {
    if (p.manager) await prisma.user.update({ where: { id: userIds[p.key] }, data: { managerId: userIds[p.manager] } });
  }

  // Indicadores pessoais do CEO
  const ceoInds: { id: string; def: IndDef }[] = [];
  for (const [i, def] of CEO_INDICATORS.entries()) {
    const ind = await prisma.indicator.create({
      data: { name: def.name, unit: def.unit ?? "COUNT", targetValue: def.targetValue, targetPeriod: def.targetPeriod, weight: def.weight, sortOrder: i, ownerId: userIds.yago },
    });
    ceoInds.push({ id: ind.id, def });
  }

  console.log("Gerando 60 dias de check-ins e indicadores…");
  const checkIns: Prisma.CheckInCreateManyInput[] = [];
  const entries: Prisma.IndicatorEntryCreateManyInput[] = [];

  for (const p of PEOPLE) {
    const area = AREAS.find((a) => a.key === p.area)!;
    const inds = p.key === "yago" ? ceoInds : indicatorsByArea[p.area];
    let pipeline = 320000 + rand() * 80000;
    // "férias"/ausência curta aleatória para alguém
    const absenceStart = p.key === "brenda" ? addDays(today, -35) : null;

    for (let d = 0; d < DAYS; d++) {
      const day = addDays(firstDay, d);
      const t = d / (DAYS - 1); // 0..1 ao longo do período
      if (!isBusinessDay(day)) continue; // fins de semana sem registro
      if (absenceStart && day >= absenceStart && day <= addDays(absenceStart, 3)) continue;
      // Junior está há 3 dias úteis sem check-in (gera alerta no dashboard)
      if (p.key === "junior" && day >= lastBusinessDaysStart(today, 3) && day < today) continue;
      if (day === today && rand() < 0.5) continue; // metade da equipe ainda não fez o check-in de hoje
      if (rand() > p.reliability) continue; // faltas de check-in

      const mood = p.perf(t) * (0.65 + rand() * 0.7) * (weekday(day) === 5 ? 0.9 : 1);
      const hasBlocker = rand() < 0.13;
      const selfScore = Math.max(1, Math.min(5, Math.round(1 + mood * 3 + (rand() - 0.5) - (hasBlocker ? 1 : 0))));
      const doneItems = [pick(area.done), pick(area.done)].filter((v, i, arr) => arr.indexOf(v) === i);
      const blockerText = hasBlocker ? pick(area.blockers) : null;
      const daysAgo = DAYS - 1 - d;
      checkIns.push({
        userId: userIds[p.key],
        date: keyToDate(day),
        yesterday: doneItems.join("; "),
        today: [pick(area.plan), pick(area.plan)].filter((v, i, arr) => arr.indexOf(v) === i).join("; "),
        blockers: blockerText,
        needsHelp: hasBlocker && rand() < 0.6,
        // bloqueios antigos costumam estar resolvidos; os recentes ficam abertos
        blockerResolvedAt: hasBlocker && daysAgo > 6 && rand() < 0.85 ? keyToDate(addDays(day, 2)) : null,
        blockerResolvedById: hasBlocker && daysAgo > 6 ? userIds.yago : null,
        selfScore,
        createdAt: new Date(keyToDate(day).getTime() + (11 + Math.floor(rand() * 10)) * 3600_000),
      });

      for (const { id, def } of inds) {
        let value: number;
        if (def.aggregation === "LAST") {
          pipeline = Math.max(50000, pipeline + (rand() - 0.42) * 30000 * p.perf(t));
          value = Math.round(pipeline / 1000) * 1000;
        } else if (def.direction === "LOWER_BETTER") {
          value = poisson(def.daily * (1.6 - mood * 0.6));
        } else {
          value = poisson(Math.max(0.01, def.daily * mood));
        }
        if (value === 0 && def.aggregation === "SUM" && rand() < 0.5) continue; // zeros nem sempre são lançados
        entries.push({ indicatorId: id, userId: userIds[p.key], date: keyToDate(day), value });
      }
    }
  }
  await prisma.checkIn.createMany({ data: checkIns });
  await prisma.indicatorEntry.createMany({ data: entries });

  console.log("Criando projetos, metas e tarefas…");
  const projects = await Promise.all(
    [
      { name: "Biorreator Piloto", kind: "PROJECT" as const },
      { name: "Edital Fomento Deep Tech 2026", kind: "PROJECT" as const },
      { name: "Frontier Tech Hub — Coorte 3", kind: "PROJECT" as const },
      { name: "BioAgro Sul", kind: "CLIENT" as const },
      { name: "Minerva Materiais", kind: "CLIENT" as const },
    ].map((p) => prisma.project.create({ data: p })),
  );
  const proj = (name: string) => projects.find((p) => p.name === name)!.id;

  type T = { who: string; title: string; kind?: "GOAL" | "TASK"; status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE"; due: number | null; project?: string; blocked?: string; by?: string; parent?: string };
  const tasks: T[] = [
    { who: "yago", kind: "GOAL", title: "Fechar rodada seed até o fim do trimestre", status: "IN_PROGRESS", due: 45 },
    { who: "yago", title: "Enviar data room para investidores", status: "IN_PROGRESS", due: 3, parent: "Fechar rodada seed até o fim do trimestre" },
    { who: "yago", title: "Contratar engenheiro de processos", status: "TODO", due: 20 },
    { who: "fernando", kind: "GOAL", title: "Atingir R$ 500 mil em pipeline qualificado", status: "IN_PROGRESS", due: 30, project: "BioAgro Sul" },
    { who: "fernando", title: "Proposta comercial BioAgro Sul", status: "IN_PROGRESS", due: -2, project: "BioAgro Sul" },
    { who: "fernando", title: "Reunião técnica com a Minerva Materiais", status: "TODO", due: 4, project: "Minerva Materiais" },
    { who: "fernando", title: "Aprovação de desconto especial", status: "BLOCKED", due: 1, project: "Minerva Materiais", blocked: "Depende de aprovação do CEO" },
    { who: "fernando", title: "Atualizar CRM com leads do evento", status: "DONE", due: -10 },
    { who: "brenda", kind: "GOAL", title: "Validar processo do biorreator em escala piloto", status: "IN_PROGRESS", due: 40, project: "Biorreator Piloto" },
    { who: "brenda", title: "Lote piloto 15", status: "IN_PROGRESS", due: 5, project: "Biorreator Piloto", parent: "Validar processo do biorreator em escala piloto" },
    { who: "brenda", title: "Comprar reagente para síntese", status: "BLOCKED", due: -1, project: "Biorreator Piloto", blocked: "Pedido de compra aguardando aprovação" },
    { who: "brenda", title: "Ficha técnica atualizada para vendas", status: "TODO", due: -4, project: "BioAgro Sul", by: "fernando" },
    { who: "brenda", title: "Relatório técnico do lote 13", status: "DONE", due: -8, project: "Biorreator Piloto", parent: "Validar processo do biorreator em escala piloto" },
    { who: "junior", kind: "GOAL", title: "Submeter 2 propostas de fomento no mês", status: "IN_PROGRESS", due: 12, project: "Edital Fomento Deep Tech 2026" },
    { who: "junior", title: "Seção de metodologia — Edital Deep Tech", status: "IN_PROGRESS", due: -3, project: "Edital Fomento Deep Tech 2026", parent: "Submeter 2 propostas de fomento no mês" },
    { who: "junior", title: "Certidões negativas atualizadas", status: "BLOCKED", due: 2, blocked: "Contabilidade ainda não emitiu", parent: "Submeter 2 propostas de fomento no mês" },
    { who: "junior", title: "Mapear chamadas internacionais", status: "TODO", due: 10 },
    { who: "ilaria", kind: "GOAL", title: "Concluir entregáveis do mês do FTH", status: "IN_PROGRESS", due: 8, project: "Frontier Tech Hub — Coorte 3" },
    { who: "ilaria", title: "Relatório mensal para o financiador", status: "IN_PROGRESS", due: 2, project: "Frontier Tech Hub — Coorte 3", parent: "Concluir entregáveis do mês do FTH" },
    { who: "ilaria", title: "Organizar demo day", status: "TODO", due: 18, project: "Frontier Tech Hub — Coorte 3" },
    { who: "natan", title: "Atualizar planilha de marcos das startups", status: "DONE", due: -5, project: "Frontier Tech Hub — Coorte 3", by: "ilaria" },
    { who: "natan", title: "Enviar convites do workshop", status: "IN_PROGRESS", due: -1, project: "Frontier Tech Hub — Coorte 3", by: "ilaria" },
    { who: "natan", title: "Reservar espaço para o demo day", status: "TODO", due: 7, project: "Frontier Tech Hub — Coorte 3", by: "ilaria" },
    { who: "natan", title: "Acesso à pasta do financiador", status: "BLOCKED", due: 0, blocked: "Aguardando liberação do financiador", by: "ilaria" },
  ];
  const created: Record<string, string> = {};
  for (const t of tasks.filter((x) => x.kind === "GOAL").concat(tasks.filter((x) => x.kind !== "GOAL"))) {
    const row = await prisma.task.create({
      data: {
        kind: t.kind ?? "TASK",
        title: t.title,
        status: t.status,
        blockedReason: t.blocked ?? null,
        dueDate: t.due === null ? null : keyToDate(addDays(today, t.due)),
        completedAt: t.status === "DONE" ? keyToDate(addDays(today, (t.due ?? 0) - 1)) : null,
        assigneeId: userIds[t.who],
        createdById: userIds[t.by ?? (t.who === "natan" ? "ilaria" : "yago")],
        projectId: t.project ? proj(t.project) : null,
        parentId: t.parent ? created[t.parent] : null,
      },
    });
    created[t.title] = row.id;
  }

  console.log("Criando feedbacks e revisões…");
  const recent = await prisma.checkIn.findMany({ where: { date: { gte: keyToDate(addDays(today, -20)) } }, orderBy: { date: "desc" } });
  const ciOf = (who: string) => recent.find((c) => c.userId === userIds[who]);
  const fb = [
    { by: "yago", to: "fernando", kind: "RECOGNITION" as const, body: "Ótimo avanço no pipeline nas últimas semanas. A proposta para a BioAgro ficou muito bem estruturada!", checkIn: ciOf("fernando")?.id },
    { by: "yago", to: "brenda", kind: "RECOGNITION" as const, body: "Documentação do protocolo v3 impecável — isso vai acelerar o edital e as vendas.", checkIn: ciOf("brenda")?.id },
    { by: "yago", to: "junior", kind: "COMMENT" as const, body: "Percebi menos check-ins nos últimos dias. Vamos conversar sobre a carga do edital e ver onde posso ajudar?", period: "WEEK" as const },
    { by: "yago", to: "ilaria", kind: "COMMENT" as const, body: "Bom alinhamento com o financiador. Vamos padronizar o modelo de relatório para as próximas coortes.", task: created["Relatório mensal para o financiador"] },
    { by: "ilaria", to: "natan", kind: "RECOGNITION" as const, body: "Excelente organização da planilha de marcos, ficou muito mais fácil acompanhar as startups.", task: created["Atualizar planilha de marcos das startups"] },
    { by: "ilaria", to: "natan", kind: "COMMENT" as const, body: "Lembre de sinalizar antes quando uma tarefa for atrasar, assim consigo redistribuir.", period: "WEEK" as const },
  ];
  for (const f of fb) {
    await prisma.feedback.create({
      data: {
        kind: f.kind,
        body: f.body,
        authorId: userIds[f.by],
        targetUserId: userIds[f.to],
        checkInId: f.checkIn ?? null,
        taskId: f.task ?? null,
        periodType: f.period ?? null,
        periodStart: f.period ? keyToDate(addDays(today, -((weekday(today) + 6) % 7))) : null,
      },
    });
  }

  const lastMonth = addMonths(startOfMonth(today), -1);
  for (const who of ["fernando", "natan"]) {
    const author = who === "natan" ? "ilaria" : "yago";
    const review = await prisma.monthlyReview.create({
      data: {
        userId: userIds[who],
        month: keyToDate(lastMonth),
        summary: who === "natan" ? "Mês consistente, com boa organização operacional do programa." : "Mês de recuperação do ritmo comercial, com pipeline crescendo.",
        strengths: who === "natan" ? "Organização, atenção aos detalhes." : "Persistência no follow-up; qualidade das propostas.",
        improvements: who === "natan" ? "Sinalizar atrasos com antecedência." : "Aumentar o número de reuniões qualificadas.",
        status: "FINALIZED",
        finalizedAt: new Date(),
        finalizedById: userIds[author],
      },
    });
    await prisma.auditLog.create({
      data: { actorId: userIds[author], subjectUserId: userIds[who], entityType: "MonthlyReview", entityId: review.id, action: "FINALIZE", after: { status: "FINALIZED" } },
    });
  }
  await prisma.monthlyReview.create({
    data: { userId: userIds.junior, month: keyToDate(lastMonth), summary: "Rascunho: revisar entregas do edital.", status: "DRAFT" },
  });

  console.log(`\n✔ Seed concluído: ${checkIns.length} check-ins, ${entries.length} lançamentos de indicadores, ${tasks.length} tarefas.`);
  console.log(`  Login: yago@arqueatec.com.br (admin), ilaria@arqueatec.com.br (coordenadora), natan@…, fernando@…, brenda@…, junior@…`);
  console.log(`  Senha de todos: ${password}`);
}

/** Primeiro dia do bloco dos últimos N dias úteis antes de hoje. */
function lastBusinessDaysStart(today: DayKey, n: number): DayKey {
  let day = today;
  let count = 0;
  while (count < n) {
    day = addDays(day, -1);
    if (isBusinessDay(day)) count++;
  }
  return day;
}
