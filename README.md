# ArqueaTec · Desempenho

Aplicativo de acompanhamento diário de desempenho da equipe ArqueaTec: check-in rápido pelo celular, indicadores por área com metas e pesos configuráveis, metas e tarefas, dashboard do CEO com alertas, notas semanais/mensais calculadas de forma transparente, feedbacks, revisões mensais e trilha de auditoria.

**Stack:** Next.js 15 (App Router, Server Components e Server Actions) · TypeScript · PostgreSQL · Prisma 6 · Tailwind CSS 4 · Zod · Vitest.

---

## Funcionalidades

| Área | O que faz |
|---|---|
| **Check-in diário** (`/checkin`) | O que foi feito, o que será feito, bloqueios/pedido de ajuda, autoavaliação 1–5 e lançamento dos indicadores do dia numa única tela pensada para o celular. O campo "feito" já vem preenchido com o plano do check-in anterior. Registro retroativo de até **2 dias úteis**; depois disso, só o administrador edita. |
| **Indicadores por área** (`/admin/indicadores`) | Meta diária, semanal ou mensal, peso, unidade (quantidade, R$, %, horas), sentido (*maior é melhor* ou *menor é melhor*, como "não conformidades") e consolidação (*soma* ou *último valor*, para estoques como "valor em pipeline"). Áreas podem permitir **indicadores pessoais** (usado pelo CEO em "Meus dados"). |
| **Metas e tarefas** (`/tarefas`) | Responsável, prazo, status (a fazer, em andamento, bloqueada, concluída), motivo do bloqueio, vínculo com projeto ou cliente e com uma meta-mãe (mostra o progresso das tarefas da meta). Tarefas atrasadas ou bloqueadas aparecem em destaque. |
| **Dashboard** (`/`) | Para o CEO (e para a coordenadora, restrito à equipe dela): quem já fez check-in, bloqueios abertos (com botão "Resolvido"), tarefas atrasadas, progresso por pessoa e por área, e alertas. Todos também veem "Meu dia". |
| **Alertas** | 3 ou mais dias úteis sem check-in; indicador semanal abaixo de 50% da meta a partir de quinta-feira; pedido de ajuda aberto há 2 dias ou mais; 2 ou mais tarefas atrasadas. |
| **Desempenho** (`/desempenho`) | Visões semanal e mensal, navegação entre períodos, comparação com o período anterior, gráficos de tendência e detalhamento de como cada indicador contribuiu para a nota. Pessoas só são comparadas **dentro da mesma área** ou **pelo % de meta atingida**. |
| **Página individual** (`/pessoas/[id]`) | Evolução de 12 semanas (nota, % da meta, autoavaliação), detalhamento da nota, tabela dos indicadores dos últimos 10 dias úteis, metas e tarefas, histórico de check-ins, feedbacks, revisões mensais e auditoria sobre a pessoa. |
| **Feedbacks** | Comentário ou reconhecimento ligado a um dia (check-in), a uma tarefa ou a um período (semana/mês). |
| **Revisões mensais** (`/pessoas/[id]/revisao/AAAA-MM`) | Rascunho → finalizada. Na finalização, a nota e o detalhamento do mês ficam **congelados**. Só o administrador reabre, e a justificativa (obrigatória) fica registrada na auditoria. |
| **Administração** (`/admin`) | Pessoas (perfil de acesso, área, liderança, ativação, senha), áreas e pesos, indicadores, projetos e clientes, e a trilha de auditoria com filtros. |
| **Meus dados** (`/meus-dados`) | Tudo o que está registrado sobre a pessoa, exportação em JSON, lembretes por e-mail, indicadores pessoais, troca de senha e encerramento das outras sessões. |

### Perfis de acesso (sempre verificados no servidor)

- **Administrador (CEO):** vê tudo, gerencia pessoas, áreas, indicadores, pesos e projetos, edita check-ins fora do prazo, exclui check-ins e reabre revisões.
- **Coordenador(a):** vê os próprios dados e os de quem lidera (direta ou indiretamente, pelo campo *Liderado(a) por*), comenta, redige e finaliza revisões dessas pessoas e atribui tarefas a elas. **Não edita o check-in de outras pessoas.**
- **Colaborador(a):** registra e consulta apenas os próprios dados e os feedbacks recebidos.

A hierarquia vem do banco (`User.managerId`). Novas pessoas, áreas e relações de liderança são cadastradas pela interface, sem mudar código. Registros sem permissão respondem 404, para não revelar que existem.

---

## Como a nota é calculada

Para cada pessoa e período (semana de segunda a domingo, ou mês):

```
Nota (0–100) = peso_indicadores × atingimento_ponderado + peso_checkin × regularidade
```

1. **Meta do período (proporcional aos dias úteis):** meta diária × dias úteis; semanal ÷ 5 por dia útil; mensal ÷ dias úteis do mês por dia útil. Em períodos em andamento, só entram os dias úteis até hoje. Indicadores de estoque (*último valor*) comparam o último lançamento com a meta, sem proporcionalizar.
2. **Atingimento de cada indicador:** realizado ÷ meta. Em *menor é melhor*, a meta é o máximo aceitável: fica em 100% até a meta e cai proporcionalmente acima dela. Na nota, cada indicador é limitado a 100% (o valor bruto também aparece), para que um indicador não compense outro indefinidamente.
3. **Atingimento ponderado** = Σ (atingimento × peso do indicador ÷ soma dos pesos). Esse é o **"% de meta atingida"**, usado para comparar pessoas de áreas diferentes.
4. **Regularidade** = check-ins em dias úteis ÷ dias úteis do período. Fins de semana não contam, nem para mais nem para menos.
5. Os pesos padrão são **80% indicadores / 20% check-in**, configuráveis por área. Sem indicadores, a nota passa a ser só a regularidade.

As telas mostram, para cada indicador, realizado, meta, atingimento, peso efetivo e **pontos somados**. A soma dos pontos é exatamente a nota. A autoavaliação aparece no histórico e no gráfico de evolução, mas não entra na nota. Dias antes do cadastro da pessoa não contam.

A regra está em `src/lib/domain/scoring.ts` (função pura, com testes).

---

## LGPD

- **Minimização:** só dados de trabalho (identificação profissional, check-ins, indicadores, tarefas, feedbacks, revisões). Sem localização, sem dados sensíveis e sem monitoramento de atividade.
- **Transparência:** cada pessoa vê, no próprio perfil, todos os check-ins, indicadores, feedbacks, revisões e **a trilha de auditoria sobre si**.
- **Portabilidade:** em "Meus dados → Exportar", a pessoa baixa um JSON com todos os seus dados (`/api/export`). O administrador pode exportar os de qualquer pessoa com `?user=ID`. Cada exportação é auditada.
- **Controle de acesso estrito:** autorização no servidor em toda página, rota e server action (`src/lib/domain/access.ts`).
- **Auditoria:** criação, edição e exclusão de check-ins, lançamentos de indicadores, indicadores, revisões (inclusive finalização e reabertura com justificativa), tarefas, feedbacks, pessoas, áreas e projetos. Cada registro guarda **quem, quando, valor anterior e valor novo**. Hashes de senha nunca entram na auditoria.

---

## Rodando localmente

Pré-requisitos: Node.js 20+ e PostgreSQL 14+ (local, Docker ou um banco gratuito no Neon).

```bash
# 1. Dependências
npm install

# 2. Variáveis de ambiente
cp .env.example .env
# edite DATABASE_URL e DIRECT_URL (localmente, as duas podem ser iguais)

# Exemplo com Docker:
# docker run -d --name pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=chibata -p 5432:5432 postgres:16

# 3. Criar as tabelas (aplica as migrações em prisma/migrations)
npx prisma migrate deploy      # ou: npm run db:migrate (modo desenvolvimento)

# 4. Dados de demonstração (APAGA os dados existentes)
npm run db:seed

# 5. Subir
npm run dev                     # http://localhost:3000
```

### Usuários de demonstração

A senha de todos é `arqueatec123` (ou o valor de `SEED_PASSWORD`).

| E-mail | Pessoa | Perfil |
|---|---|---|
| yago@arqueatec.com.br | Yago, CEO (Direção, com indicadores pessoais) | Administrador |
| fernando@arqueatec.com.br | Fernando, Vendas | Colaborador |
| brenda@arqueatec.com.br | Brenda, Produção e Pesquisa | Colaboradora |
| junior@arqueatec.com.br | Junior, Escrita de Projetos | Colaborador |
| ilaria@arqueatec.com.br | Ilaria, Coordenação Frontier Tech Hub | Coordenadora (lidera o Natan) |
| natan@arqueatec.com.br | Natan, Assistência FTH | Colaborador (reporta à Ilaria) |

O seed gera **60 dias** de dados determinísticos até a data em que roda:
- dias bons e ruins;
- bloqueios, alguns resolvidos e outros abertos, com pedidos de ajuda;
- faltas de check-in, e o Junior fica 3 dias úteis sem registrar, o que dispara o alerta;
- ausência de alguns dias da Brenda;
- fins de semana sem registro;
- tendências: Fernando em alta, Junior em queda.

Também cria tarefas atrasadas e bloqueadas, feedbacks (incluindo Ilaria → Natan) e revisões do mês anterior (finalizadas e em rascunho).

### Link mágico

Em "Entrar", informe o e-mail e clique em "Enviar link de acesso". Com `RESEND_API_KEY` e `EMAIL_FROM` configurados, o link chega por e-mail. Em desenvolvimento sem essas variáveis, **o link é impresso no terminal do servidor**. O link vale 15 minutos e só pode ser usado uma vez. Ele é consumido apenas ao clicar em "Entrar" na página de confirmação, para que pré-visualizadores de e-mail não o invalidem.

### Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Testes unitários (Vitest) |
| `npm run typecheck` | Verificação de tipos |
| `npm run build` | `prisma generate` + build de produção |
| `npm run db:migrate` | Cria ou aplica migrações em desenvolvimento |
| `npm run db:deploy` | Aplica migrações (produção) |
| `npm run db:seed` | Recria os dados de demonstração |
| `npm run db:reset` | Apaga o banco, reaplica as migrações e roda o seed |

### Testes

`tests/` cobre as regras de negócio, que ficam em funções puras em `src/lib/domain/`:

- `scoring.test.ts`: meta proporcional (diária, semanal, mensal), *menor é melhor*, estoque (*último valor*), limite de 100%, pesos, soma das contribuições igual à nota, período em andamento, fins de semana, período futuro.
- `access.test.ts`: administrador, a relação **Ilaria–Natan** (vê e comenta o Natan, mas não edita o check-in dele, não vê outras pessoas e não reabre revisões), colaborador, usuário inativo, hierarquia transitiva, proteção contra ciclos, perda de acesso ao deixar de ser coordenadora.
- `editWindow.test.ts`: bloqueio de edição após 2 dias úteis, fins de semana, datas futuras, exceção do administrador.
- `alerts.test.ts`: dias sem check-in e meta semanal abaixo de 50% a partir de quinta.

---

## Publicando na Vercel

1. **Banco:** crie um banco PostgreSQL no [Neon](https://neon.tech) (ou pela integração *Storage → Neon/Postgres* da Vercel). Copie:
   - a URL **com pooling** (host com `-pooler`) para `DATABASE_URL`;
   - a URL **direta** para `DIRECT_URL` (usada pelas migrações).
2. **Projeto:** importe o repositório na Vercel. O framework é detectado como Next.js.
3. **Variáveis de ambiente** (*Settings → Environment Variables*):
   - `DATABASE_URL`, `DIRECT_URL`
   - `APP_URL`: a URL pública, ex.: `https://desempenho.arqueatec.com.br`
   - `CRON_SECRET`: valor aleatório longo (`openssl rand -hex 32`)
   - `APP_TIMEZONE=America/Sao_Paulo`
   - opcional: `RESEND_API_KEY` e `EMAIL_FROM` (domínio verificado na Resend) para link mágico e lembretes
4. **Deploy:** a Vercel executa o script `vercel-build` (`prisma generate && prisma migrate deploy && next build`), então as migrações são aplicadas a cada deploy.
5. **Primeiros dados:** para a demonstração, rode uma vez a partir da sua máquina, apontando para o banco de produção:
   ```bash
   DATABASE_URL="<url-direta>" DIRECT_URL="<url-direta>" npm run db:seed
   ```
   Para uso real, crie só o administrador e cadastre o restante pela interface. Por exemplo, rode o seed e depois ajuste ou desative as pessoas em `/admin/pessoas` e troque as senhas.
6. **Lembretes:** `vercel.json` agenda `/api/cron/reminders` em dias úteis às 12:00 UTC (9:00 em Brasília). A Vercel envia `Authorization: Bearer $CRON_SECRET` automaticamente. O e-mail só vai para quem ativou os lembretes em "Meus dados" e ainda não fez o check-in do dia.

---

## Estrutura

```
prisma/
  schema.prisma          modelo de dados
  migrations/            migrações SQL versionadas
  seed.ts                dados de demonstração
src/
  lib/domain/            regras puras e testadas: datas, notas, acesso, prazo de edição, alertas
  lib/services/          consultas agregadas (desempenho em lote, dashboard, indicadores)
  lib/auth/              sessões (cookie httpOnly + hash SHA-256 no banco), senhas (bcrypt), tokens
  lib/authz.ts           contexto de acesso por requisição
  lib/audit.ts           trilha de auditoria (antes/depois)
  lib/actions.ts         wrapper de server actions: erros → mensagens em português
  app/actions/           server actions (check-in, tarefas, feedback, revisões, admin, conta, auth)
  app/(app)/             páginas autenticadas
  app/api/               exportação de dados e cron de lembretes
  components/            UI (formulários, gráfico SVG, detalhamento da nota, listas)
tests/                   testes Vitest
```

### Decisões técnicas

- **Server Components + Server Actions:** toda leitura e escrita acontece no servidor, onde a autorização é aplicada. O cliente recebe só o HTML e pouco JavaScript. Formulários funcionam sem estado global.
- **Sessão própria em vez de biblioteca de auth:** um token aleatório de 256 bits no cookie `httpOnly`/`SameSite=Lax`, com apenas o hash no banco. Isso permite revogar sessões (logout em outros dispositivos, desativação de pessoa) e mantém o controle explícito. Há limite de tentativas de login por conta, persistido no banco, o que funciona em serverless.
- **Regras de negócio como funções puras** (`src/lib/domain`): fáceis de testar e reutilizadas nas páginas, nas actions e nos alertas.
- **Datas como `DATE`** e chaves `AAAA-MM-DD`, com "hoje" calculado no fuso `APP_TIMEZONE`, sem deslocamento de fuso.
- **Notas calculadas sob demanda** a partir dos lançamentos. Mudar um peso recalcula tudo de forma consistente, e as revisões finalizadas guardam uma cópia congelada.
- **Gráficos em SVG** renderizados no servidor, sem bibliotecas pesadas.

---

## Limitações conhecidas

- **Feriados** não são considerados: dias úteis são de segunda a sexta. Um feriado conta como dia útil sem check-in. Para tratar isso, crie uma tabela de feriados e use-a em `isBusinessDay`.
- **Lembretes** só por e-mail (Resend), em um único horário diário por causa do limite de cron do plano Hobby da Vercel. Não há notificações push nem horário por pessoa.
- **Nota de períodos em andamento:** o dia de hoje já conta na regularidade, então quem ainda não fez o check-in de hoje aparece temporariamente com a nota um pouco menor.
- **Excluir ou anonimizar a conta** (direito de eliminação da LGPD) não é automático: o administrador desativa a pessoa. A exclusão definitiva precisa ser feita no banco, respeitando a retenção dos registros de auditoria.
- A mudança de área de uma pessoa aplica os indicadores da nova área também aos períodos anteriores ainda não finalizados.
- Não há testes de integração automatizados no repositório. Os fluxos de ponta a ponta (login por senha e por link mágico, check-in, bloqueio após o prazo, tentativa de enviar um check-in forjado, feedback, finalização e reabertura de revisão, tarefas, administração e exportação) foram verificados manualmente com Playwright durante o desenvolvimento.
