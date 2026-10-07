/**
 * Carga das funções, indicadores e metas da equipe ArqueaTec (outubro/2026 a março/2027).
 *
 * Diferente de `demo.ts`, esta carga é ADITIVA e pode ser executada mais de uma vez:
 *  - áreas são localizadas pelo nome; pessoas, pelo e-mail ou pelo primeiro nome;
 *  - indicadores são localizados por (área ou dono) + nome; metas, por responsável + título;
 *  - nada é apagado, exceto quando `limparDemo` é pedido explicitamente (ver abaixo).
 *
 * Tudo roda em uma única transação. Em modo de simulação (`aplicar: false`) a transação é
 * desfeita no final, então o relatório mostra exatamente o que seria gravado.
 *
 * Divisão combinada: o Chibata guarda o que é medido toda semana (indicadores, check-in, notas e
 * revisão mensal); o Asana guarda as entregas com prazo e a rotina de cobrança. Por isso só as
 * metas principais de cada pessoa entram aqui como "Meta" (kind GOAL), sem as subtarefas.
 */
import type { Aggregation, Direction, IndicatorUnit, Prisma, PrismaClient, Role, TargetPeriod } from "@prisma/client";
import { keyToDate, todayKey, type DayKey } from "../domain/dates";

// ---------------------------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------------------------

type AreaKey = "direcao" | "vendas" | "producao" | "pdi" | "fth" | "assistencia";
type PersonKey = "yago" | "fernando" | "brenda" | "junior" | "ilaria" | "natan";

type IndDef = {
  name: string;
  description?: string;
  unit?: IndicatorUnit;
  direction?: Direction;
  aggregation?: Aggregation;
  targetValue: number;
  targetPeriod: TargetPeriod;
  weight: number;
};

type GoalDef = { title: string; due: DayKey; description?: string };

/** Rampa de vendas informada pelo Fernando (total de 17.000 L no período). */
const RAMPA_LITROS: { ate: string; litros: number }[] = [
  { ate: "2026-10", litros: 1000 },
  { ate: "2026-11", litros: 2000 },
];
const LITROS_REGIME = 3500; // dezembro/2026 em diante

/** Meta mensal de litros para o mês de referência (YYYY-MM). Rode a carga de novo a cada mês para atualizar. */
export function litrosDoMes(mes: string): number {
  for (const r of RAMPA_LITROS) if (mes <= r.ate) return r.litros;
  return LITROS_REGIME;
}

const PROVISORIA = "Data provisória: o prazo ainda não foi definido e será atualizado.";

function areas(mes: string): {
  key: AreaKey;
  name: string;
  /** Nome da área nos dados de demonstração, se for diferente: nesse caso a área é renomeada. */
  legacyName?: string;
  description: string;
  allowPersonal?: boolean;
  /** Peso dos indicadores e do check-in na nota (padrão do app: 80/20). */
  weights?: { indicators: number; checkin: number };
  indicators: IndDef[];
}[] {
  const litros = litrosDoMes(mes);
  return [
    {
      key: "direcao",
      name: "Direção",
      description: "CEO: atua em todas as áreas. Indicadores pessoais.",
      allowPersonal: true,
      indicators: [],
    },
    {
      key: "vendas",
      name: "Vendas",
      description: "Gestão comercial: prospecção, representantes e distribuidores, testes e vendas do NoFire.",
      indicators: [
        { name: "Prospects privados cadastrados e contatados", description: "Além dos contatos vindos das entrevistas. Fonte: CRM.", targetValue: 30, targetPeriod: "MONTHLY", weight: 2 },
        { name: "Prospects institucionais cadastrados e contatados", description: "Corpos de bombeiros, Defesa Civil etc. Fonte: CRM.", targetValue: 6, targetPeriod: "MONTHLY", weight: 2 },
        { name: "Representantes e distribuidores efetivados", description: "Representante conta com contrato assinado; distribuidor, com pedido. Fonte: CRM.", targetValue: 4, targetPeriod: "MONTHLY", weight: 3 },
        { name: "Treinamentos de representantes e distribuidores", description: "Um treinamento por efetivação.", targetValue: 4, targetPeriod: "MONTHLY", weight: 1 },
        { name: "Testes agendados e avaliados", description: "Resumo no CRM; relatório quando o cliente disponibilizar ou o teste for acompanhado.", targetValue: 2, targetPeriod: "MONTHLY", weight: 2 },
        { name: "Litros vendidos", description: "Rampa: out 1.000 L, nov 2.000 L, dez a mar 3.500 L/mês. A meta é atualizada a cada mês pela carga. Fonte: CRM e sistema.", targetValue: litros, targetPeriod: "MONTHLY", weight: 4 },
      ],
    },
    {
      key: "producao",
      name: "Produção e Pesquisa",
      description: "Produção e controle de qualidade do NoFire; otimização do processo e desenvolvimento da massa ex loco.",
      indicators: [
        { name: "Litros produzidos", description: "Acompanha a rampa de vendas. Capacidade atual: cerca de 4.000 L/mês. Fonte: ordem de produção/ficha de lote.", targetValue: litros, targetPeriod: "MONTHLY", weight: 3 },
        { name: "Tempo médio de produção por lote", description: "Inclui envase. Hoje cerca de 5 h; meta de 4 h até fevereiro/2027. Lançar a média mais recente.", unit: "HOURS", direction: "LOWER_BETTER", aggregation: "LAST", targetValue: 4, targetPeriod: "MONTHLY", weight: 2 },
        { name: "Lotes com ficha de lote completa (%)", description: "Lançar o percentual acumulado do mês.", unit: "PERCENT", aggregation: "LAST", targetValue: 100, targetPeriod: "MONTHLY", weight: 2 },
      ],
    },
    {
      key: "pdi",
      name: "PD&I e Relações Institucionais",
      legacyName: "Escrita de Projetos",
      description: "Estratégia de PD&I, captação de recursos, parcerias e relações institucionais (dedicação de 10 horas semanais).",
      // Dedicação parcial: a nota não depende de check-in diário.
      weights: { indicators: 100, checkin: 0 },
      indicators: [
        { name: "Horas dedicadas à ArqueaTec", unit: "HOURS", targetValue: 10, targetPeriod: "WEEKLY", weight: 1 },
        { name: "Entregas de PD&I e relações institucionais concluídas", description: "As 19 entregas do semestre, distribuídas em cerca de 3 por mês (ver calendário no Asana).", targetValue: 3, targetPeriod: "MONTHLY", weight: 3 },
      ],
    },
    {
      key: "fth",
      name: "Coordenação Frontier Tech Hub",
      description: "Coordenação do projeto NoFire: Stop the Spread no Frontier Tech Hub.",
      indicators: [
        { name: "Reuniões semanais realizadas", description: "Quinta-feira, das 10h às 11h, com ata e lista de pendências.", targetValue: 1, targetPeriod: "WEEKLY", weight: 2 },
        { name: "Demandas de investidores respondidas em até 2 dias úteis (%)", description: "Lançar o percentual acumulado do mês.", unit: "PERCENT", aggregation: "LAST", targetValue: 100, targetPeriod: "MONTHLY", weight: 2 },
      ],
    },
    {
      key: "assistencia",
      name: "Assistência FTH",
      description: "Apoio à coordenação do Frontier Tech Hub: atas, pendências e respostas aos coaches.",
      indicators: [
        { name: "Atas da reunião semanal registradas no Asana", targetValue: 1, targetPeriod: "WEEKLY", weight: 3 },
        { name: "Pendências com responsável e prazo (%)", description: "Lançar o percentual atual.", unit: "PERCENT", aggregation: "LAST", targetValue: 100, targetPeriod: "MONTHLY", weight: 2 },
        { name: "Demandas repassadas com briefing (%)", description: "Lançar o percentual acumulado do mês.", unit: "PERCENT", aggregation: "LAST", targetValue: 100, targetPeriod: "MONTHLY", weight: 1 },
        { name: "Respostas enviadas sem orientação prévia (%)", description: "Meta de 60% até março/2027. Lançar o percentual acumulado do mês.", unit: "PERCENT", aggregation: "LAST", targetValue: 60, targetPeriod: "MONTHLY", weight: 2 },
      ],
    },
  ];
}

/** Indicadores pessoais do CEO (a área Direção permite indicadores pessoais). */
const CEO_INDICATORS: IndDef[] = [
  { name: "Monitoramentos semanais de editais realizados", description: "Toda quinta-feira: editais em inscrição, submetidos e resultados.", targetValue: 1, targetPeriod: "WEEKLY", weight: 1 },
  { name: "Fechamentos semanais da equipe realizados", description: "Toda sexta-feira: conferir as atualizações da equipe e preencher o próprio.", targetValue: 1, targetPeriod: "WEEKLY", weight: 1 },
  { name: "Revisões mensais de metas realizadas", description: "Última sexta-feira do mês. Meta do semestre: 6 de 6.", targetValue: 1, targetPeriod: "MONTHLY", weight: 2 },
  { name: "Controle financeiro por projeto atualizado", description: "Uma atualização por mês. Meta do semestre: 6 de 6.", targetValue: 1, targetPeriod: "MONTHLY", weight: 2 },
];

const PEOPLE: {
  key: PersonKey;
  /** Nome usado apenas se a pessoa precisar ser criada. */
  name: string;
  /** E-mails pelos quais a pessoa pode já estar cadastrada. O primeiro é usado se ela precisar ser criada. */
  emails: string[];
  /** Primeiros nomes aceitos para localizar a pessoa quando nenhum e-mail coincide. */
  tokens: string[];
  /** Perfil usado apenas na criação; o perfil de quem já existe não é alterado. */
  role: Role;
  jobTitle: string;
  area: AreaKey;
  manager: PersonKey | null;
}[] = [
  { key: "yago", name: "Yago", emails: ["jyagors@gmail.com", "yago.rodrigues@ufpe.br", "arqueatec@gmail.com", "yago@arqueatec.com.br"], tokens: ["yago"], role: "ADMIN", jobTitle: "CEO", area: "direcao", manager: null },
  { key: "fernando", name: "Fernando", emails: ["fernando@metalshop.com.br", "fernando@arqueatec.com.br"], tokens: ["fernando"], role: "COLLABORATOR", jobTitle: "Gestor Comercial", area: "vendas", manager: "yago" },
  { key: "brenda", name: "Brenda", emails: ["brenda.violane@ufpe.br", "brendaviolane@gmail.com", "brenda@arqueatec.com.br"], tokens: ["brenda"], role: "COLLABORATOR", jobTitle: "Produção e Controle de Qualidade", area: "producao", manager: "yago" },
  { key: "junior", name: "Junior", emails: ["severino.alvesjr@ufpe.br", "junior@arqueatec.com.br"], tokens: ["severino", "junior"], role: "COLLABORATOR", jobTitle: "Cofundador | Diretor Científico, Tecnológico e de Relações Institucionais", area: "pdi", manager: "yago" },
  { key: "ilaria", name: "Ilaria", emails: ["ilaria.martina@ufpe.br", "ilaria@arqueatec.com.br"], tokens: ["ilaria"], role: "COORDINATOR", jobTitle: "Coordenadora do Frontier Tech Hub", area: "fth", manager: "yago" },
  { key: "natan", name: "Natan", emails: ["natan.silva@ufpe.br", "natan@arqueatec.com.br"], tokens: ["natan"], role: "COLLABORATOR", jobTitle: "Apoio à coordenação do Frontier Tech Hub", area: "assistencia", manager: "ilaria" },
];

/** E-mails fictícios criados pelos dados de demonstração. */
const DEMO_EMAILS = ["yago", "fernando", "brenda", "junior", "ilaria", "natan"].map((n) => `${n}@arqueatec.com.br`);

const GOALS: Record<PersonKey, GoalDef[]> = {
  yago: [
    { title: "Plano de entrada na Espanha definido", due: "2026-10-10" },
    { title: "Documento de estruturação concluído", due: "2026-10-20" },
    { title: "Laudo de eficácia do NoFire pela NBR 17044-1 emitido", due: "2026-10-30" },
    { title: "Bateria de ecotoxicologia do NoFire concluída", due: "2026-10-30" },
    { title: "Prestação de contas da missão à Espanha", due: "2026-10-30" },
    { title: "Equipe com indicadores no documento de gestão e entregas no Asana", due: "2026-10-30" },
    { title: "Averbação do contrato de licenciamento UFPE/Arqueatec no INPI", due: "2026-10-30", description: "Pedido de patente BR 10 2022 015289 6. Enviar o comprovante à Coordenação de Transferência de Tecnologia da UFPE." },
    { title: "FISPQ do NoFire corrigida e reemitida", due: "2026-11-30" },
    { title: "Massa para produção de NoFire ex loco desenvolvida", due: "2026-12-31" },
    { title: "Espaço de produção definido e formalizado (ITEP)", due: "2027-01-29" },
    { title: "Dossiê técnico do NoFire protocolado no IBAMA/Prevfogo", due: "2027-02-26", description: "Eficácia + ecotoxicologia." },
    { title: "Reunião formal com a coordenação do Prevfogo", due: "2027-02-26" },
    { title: "Converter pelo menos 2 POCs em contrato ou pedido", due: "2027-03-31", description: "POCs em andamento: Bombeiro da Espanha; Caiman; Tocantins, com Francineia; Felipe (empresa de drone)." },
    { title: "Europa: parceiro local formalizado e ensaio em laboratório europeu", due: "2027-03-31", description: "Pelo menos 1 parceiro local (carta de intenção ou acordo) e ensaio contratado ou agendado." },
    { title: "Captação: pelo menos 3 projetos submetidos a editais e 1 aprovado", due: "2027-03-31" },
  ],
  fernando: [
    { title: "Business model", due: "2026-11-20", description: "Documento estruturado, diferente do entregue ao Frontier Tech Hub em 06/10. Primeiro desenho até 30/10." },
    { title: "Pesquisa de mercado e cotação com concorrentes (4º trimestre de 2026)", due: "2026-12-31" },
    { title: "Pesquisa de mercado e cotação com concorrentes (1º trimestre de 2027)", due: "2027-03-31" },
  ],
  brenda: [
    { title: "Padronizar a identificação e a rotulagem do NoFire", due: "2026-11-30" },
    { title: "Estudo de condições e tempos mínimos de cada etapa da produção do NoFire", due: "2026-12-31" },
    { title: "Reduzir o tempo médio de produção de 5 para 4 horas por lote", due: "2027-02-26" },
    { title: "Massa para produção de NoFire ex loco: testes iniciais e formulação inicial", due: "2027-03-31", description: "Testes iniciais, formulação inicial/condição de preparo mais adequada e identificação dos principais entraves." },
  ],
  junior: [
    { title: "Mapa tecnológico: técnicas, laboratórios e procedimentos de acesso", due: "2027-01-29" },
    { title: "Captação: identificar e avaliar pelo menos 4 oportunidades de financiamento para PD&I", due: "2027-03-31" },
    { title: "Estruturar pelo menos 2 propostas de PD&I (ArqueaTEC, ICTs e/ou empresas)", due: "2027-03-31" },
    { title: "Prospectar pelo menos 2 parceiros estratégicos (universidades, ICTs, empresas)", due: "2027-03-31" },
    { title: "Participar de pelo menos 2 reuniões técnico-estratégicas", due: "2027-03-31" },
    { title: "Estruturar pelo menos 2 demandas técnicas de clientes em planos experimentais", due: "2027-03-31" },
    { title: "Identificar pelo menos 2 oportunidades de novos produtos ou aplicações", due: "2027-03-31" },
    { title: "Avaliar pelo menos 2 resultados tecnológicos quanto ao potencial de PI", due: "2027-03-31" },
    { title: "Representar a ArqueaTEC em pelo menos 2 eventos de inovação", due: "2027-03-31" },
  ],
  ilaria: [
    { title: "Frontier Tech Hub: entregar o organograma", due: "2026-10-30", description: PROVISORIA },
    { title: "Frontier Tech Hub: entregar os vídeos dos testes", due: "2026-11-30", description: PROVISORIA },
    { title: "Concluir os sprints do Frontier Tech Hub: todos os deliverables enviados", due: "2026-12-31" },
    { title: "Plano do piloto discutido com o time e os coaches e validado", due: "2026-12-31" },
    { title: "Relatório final do Frontier Tech Hub", due: "2027-01-29" },
    { title: "Mapear 2 novos programas ou fontes de financiamento internacionais", due: "2027-01-29" },
    { title: "Apresentar 3 pitches da Arqueatec", due: "2027-03-31", description: "Cada pitch acontece entre 1 e 2 semanas depois do fim de cada sprint." },
  ],
  natan: [
    { title: "Criar a base de consulta com as informações essenciais da Arqueatec e do projeto", due: "2026-12-31", description: `Depende do organograma. ${PROVISORIA}` },
    { title: "Criar o modelo de briefing para as tarefas repassadas", due: "2027-01-29", description: PROVISORIA },
    { title: "Ampliar a autonomia: 60% das respostas enviadas sem orientação prévia", due: "2027-03-31" },
  ],
};

// ---------------------------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------------------------

export interface CargaOptions {
  /** false (padrão): simula e desfaz tudo no final. true: grava. */
  aplicar?: boolean;
  /** Desativa os outros indicadores ativos das áreas e do CEO que não fazem parte desta carga. Padrão: true. */
  desativarOutros?: boolean;
  /**
   * Apaga os dados de atividade de demonstração (check-ins, lançamentos, tarefas, feedbacks, revisões,
   * auditoria e projetos) e reinicia a data de início das pessoas. Só é aceito se o banco tiver os
   * e-mails fictícios da demonstração. NÃO distingue registros reais feitos depois: apaga todos.
   */
  limparDemo?: boolean;
  /** Dia de referência (YYYY-MM-DD). Padrão: hoje, no fuso do app. */
  hoje?: DayKey;
  log?: (msg: string) => void;
}

export interface CargaResult {
  aplicado: boolean;
  contagem: Record<string, number>;
  avisos: string[];
}

class Rollback extends Error {}

/** Erro com mensagem pensada para quem está executando a carga (pode ser exibida na tela). */
export class CargaError extends Error {}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

type Tx = Prisma.TransactionClient;

export async function cargaMetas(prisma: PrismaClient, opts: CargaOptions = {}): Promise<CargaResult> {
  const log = opts.log ?? (() => {});
  const aplicar = opts.aplicar === true;
  const desativarOutros = opts.desativarOutros !== false;
  const hoje = opts.hoje ?? todayKey();
  const mes = hoje.slice(0, 7);
  const avisos: string[] = [];
  const contagem: Record<string, number> = {};
  const conta = (k: string, n = 1) => (contagem[k] = (contagem[k] ?? 0) + n);
  const aviso = (m: string) => {
    avisos.push(m);
    log(`  ! ${m}`);
  };

  const run = async (tx: Tx) => {
    // --- Diagnóstico -------------------------------------------------------------------------
    const todos = await tx.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true } });
    const demoPresentes = todos.filter((u) => DEMO_EMAILS.includes(u.email.toLowerCase())).length;
    const [nCheckins, nEntries, nTasks] = await Promise.all([tx.checkIn.count(), tx.indicatorEntry.count(), tx.task.count()]);
    log(`Banco: ${todos.length} pessoa(s), ${nCheckins} check-in(s), ${nEntries} lançamento(s) de indicador, ${nTasks} tarefa(s)/meta(s).`);
    if (todos.length === 0) throw new CargaError("O banco não tem nenhuma pessoa. Faça a configuração inicial em /setup antes da carga.");
    const pareceDemo = demoPresentes >= 4;
    if (pareceDemo) log(`O banco parece conter os dados de demonstração (${demoPresentes} de 6 e-mails fictícios encontrados).`);

    // --- Limpeza opcional dos dados de demonstração ------------------------------------------
    if (opts.limparDemo) {
      if (!pareceDemo) throw new CargaError("--limpar-demo recusado: o banco não tem os e-mails da demonstração, então os dados podem ser reais.");
      log("Limpando os dados de atividade da demonstração…");
      conta("auditoria apagada", (await tx.auditLog.deleteMany()).count);
      conta("feedbacks apagados", (await tx.feedback.deleteMany()).count);
      conta("revisões mensais apagadas", (await tx.monthlyReview.deleteMany()).count);
      await tx.task.updateMany({ data: { parentId: null } });
      conta("tarefas/metas apagadas", (await tx.task.deleteMany()).count);
      conta("projetos apagados", (await tx.project.deleteMany()).count);
      conta("lançamentos de indicador apagados", (await tx.indicatorEntry.deleteMany()).count);
      conta("check-ins apagados", (await tx.checkIn.deleteMany()).count);
      // A nota e os alertas contam a partir da data de criação da pessoa: recomeça em `hoje`.
      await tx.user.updateMany({ data: { createdAt: keyToDate(hoje) } });
    } else if (pareceDemo && nCheckins + nEntries > 0) {
      aviso("Os check-ins e lançamentos fictícios da demonstração continuam no banco e entram nas notas. Use --limpar-demo para recomeçar do zero.");
    }

    // --- Áreas -------------------------------------------------------------------------------
    log("Áreas…");
    const areaIds = {} as Record<AreaKey, string>;
    const AREAS = areas(mes);
    for (const a of AREAS) {
      let area = await tx.area.findUnique({ where: { name: a.name } });
      let renomeada = false;
      if (!area && a.legacyName) {
        const legacy = await tx.area.findUnique({ where: { name: a.legacyName } });
        if (legacy) {
          area = await tx.area.update({ where: { id: legacy.id }, data: { name: a.name } });
          renomeada = true;
          conta("áreas renomeadas");
          log(`  ~ ${a.legacyName} → ${a.name}`);
        }
      }
      const extra = {
        ...(a.allowPersonal ? { allowPersonalIndicators: true } : {}),
        ...(a.weights ? { indicatorsWeight: a.weights.indicators, checkinWeight: a.weights.checkin } : {}),
      };
      if (!area) {
        area = await tx.area.create({ data: { name: a.name, description: a.description, ...extra } });
        conta("áreas criadas");
        log(`  + ${a.name}`);
      } else {
        area = await tx.area.update({ where: { id: area.id }, data: { active: true, description: a.description, ...extra } });
        if (!renomeada) conta("áreas atualizadas");
      }
      areaIds[a.key] = area.id;
    }

    // --- Pessoas -----------------------------------------------------------------------------
    log("Pessoas…");
    const userIds = {} as Record<PersonKey, string>;
    for (const p of PEOPLE) {
      const emails = p.emails.map((e) => e.toLowerCase());
      let found = todos.filter((u) => emails.includes(u.email.toLowerCase()));
      if (found.length === 0) {
        found = todos.filter((u) => p.tokens.some((t) => norm(u.name).split(/\s+/).includes(t)));
      }
      if (found.length === 0 && p.key === "yago") {
        const admins = todos.filter((u) => u.role === "ADMIN" && u.active);
        if (admins.length === 1) found = admins;
      }
      if (found.length > 1) {
        throw new CargaError(
          `Mais de uma pessoa corresponde a "${p.name}": ${found.map((u) => `${u.name} <${u.email}>`).join(", ")}. Ajuste a lista PEOPLE em src/lib/seed/metas.ts.`,
        );
      }
      const data = { jobTitle: p.jobTitle, areaId: areaIds[p.area] };
      if (found.length === 1) {
        const u = found[0];
        await tx.user.update({ where: { id: u.id }, data });
        userIds[p.key] = u.id;
        conta("pessoas atualizadas");
        log(`  ~ ${u.name} <${u.email}>: ${p.jobTitle}`);
        if (!u.active) aviso(`${u.name} está inativo(a) no sistema: reative em Administração → Pessoas.`);
      } else {
        const u = await tx.user.create({ data: { name: p.name, email: emails[0], role: p.role, passwordHash: null, reminderEnabled: p.key !== "yago", ...data } });
        userIds[p.key] = u.id;
        conta("pessoas criadas");
        log(`  + ${p.name} <${emails[0]}>: ${p.jobTitle}`);
        aviso(`${p.name} foi criado(a) sem senha: defina a senha em Administração → Pessoas para liberar o acesso.`);
      }
    }
    for (const p of PEOPLE) {
      await tx.user.update({ where: { id: userIds[p.key] }, data: { managerId: p.manager ? userIds[p.manager] : null } });
    }

    // --- Indicadores -------------------------------------------------------------------------
    log("Indicadores…");
    const upsertIndicators = async (scope: { areaId: string } | { ownerId: string }, defs: IndDef[], label: string) => {
      const existing = await tx.indicator.findMany({ where: scope });
      const keep = new Set<string>();
      for (const [i, def] of defs.entries()) {
        const data = {
          name: def.name,
          description: def.description ?? null,
          unit: def.unit ?? ("COUNT" as IndicatorUnit),
          direction: def.direction ?? ("HIGHER_BETTER" as Direction),
          aggregation: def.aggregation ?? ("SUM" as Aggregation),
          targetValue: def.targetValue,
          targetPeriod: def.targetPeriod,
          weight: def.weight,
          sortOrder: i,
          active: true,
        };
        const cur = existing.find((e) => norm(e.name) === norm(def.name));
        if (cur) {
          await tx.indicator.update({ where: { id: cur.id }, data });
          keep.add(cur.id);
          conta("indicadores atualizados");
        } else {
          const c = await tx.indicator.create({ data: { ...data, ...scope } });
          keep.add(c.id);
          conta("indicadores criados");
          log(`  + ${label}: ${def.name} (meta ${def.targetValue}, ${def.targetPeriod})`);
        }
      }
      if (opts.limparDemo) {
        // Sem lançamentos (apagados acima), os indicadores da demonstração podem ser removidos de vez.
        const demo = existing.filter((e) => !keep.has(e.id));
        if (demo.length) {
          await tx.indicator.deleteMany({ where: { id: { in: demo.map((o) => o.id) } } });
          conta("indicadores da demonstração apagados", demo.length);
        }
        return;
      }
      const outros = existing.filter((e) => e.active && !keep.has(e.id));
      if (outros.length && desativarOutros) {
        await tx.indicator.updateMany({ where: { id: { in: outros.map((o) => o.id) } }, data: { active: false } });
        conta("indicadores antigos desativados", outros.length);
        for (const o of outros) log(`  - ${label}: desativado "${o.name}"`);
      } else if (outros.length) {
        aviso(`${label}: ${outros.length} indicador(es) antigo(s) continuam ativos (${outros.map((o) => o.name).join("; ")}).`);
      }
    };
    for (const a of AREAS) await upsertIndicators({ areaId: areaIds[a.key] }, a.indicators, a.name);
    await upsertIndicators({ ownerId: userIds.yago }, CEO_INDICATORS, "CEO (pessoal)");

    // --- Metas -------------------------------------------------------------------------------
    log("Metas…");
    for (const p of PEOPLE) {
      const assigneeId = userIds[p.key];
      const existing = await tx.task.findMany({ where: { assigneeId, kind: "GOAL" } });
      for (const g of GOALS[p.key]) {
        const cur = existing.find((e) => norm(e.title) === norm(g.title));
        if (!cur) {
          await tx.task.create({
            data: { kind: "GOAL", title: g.title, description: g.description ?? null, dueDate: keyToDate(g.due), assigneeId, createdById: userIds.yago },
          });
          conta("metas criadas");
        } else if (cur.status === "DONE") {
          conta("metas já concluídas (não alteradas)");
        } else {
          await tx.task.update({ where: { id: cur.id }, data: { dueDate: keyToDate(g.due), description: g.description ?? cur.description } });
          conta("metas atualizadas");
        }
      }
      log(`  ${p.name}: ${GOALS[p.key].length} meta(s)`);
    }

    // --- Auditoria ---------------------------------------------------------------------------
    await tx.auditLog.create({
      data: {
        actorId: userIds.yago,
        entityType: "Carga",
        entityId: `metas-${mes}`,
        action: "IMPORT",
        after: { referencia: hoje, litrosDoMes: litrosDoMes(mes), ...contagem },
        reason: "Carga de funções, indicadores e metas (out/2026 a mar/2027)",
      },
    });

    if (!aplicar) throw new Rollback();
  };

  try {
    await prisma.$transaction(run, { maxWait: 15_000, timeout: 120_000 });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return { aplicado: aplicar, contagem, avisos };
}
