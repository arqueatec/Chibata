/**
 * Carga das funções, indicadores e metas reais da equipe (não apaga nada por padrão).
 *
 *   npx tsx prisma/carga-metas.ts                        simula e mostra o que seria gravado
 *   npx tsx prisma/carga-metas.ts --aplicar              grava
 *   npx tsx prisma/carga-metas.ts --limpar-demo          simula também a limpeza dos dados fictícios
 *   npx tsx prisma/carga-metas.ts --limpar-demo --aplicar
 *   npx tsx prisma/carga-metas.ts --manter-outros        não desativa os indicadores antigos
 *
 * Precisa de DATABASE_URL e DATABASE_URL_UNPOOLED apontando para o banco (arquivo .env na raiz).
 * Pode ser executada de novo a qualquer momento: atualiza o que já existe em vez de duplicar.
 * Rode de novo no início de cada mês para atualizar a meta de litros conforme a rampa.
 */
import { PrismaClient } from "@prisma/client";
import { cargaMetas } from "../src/lib/seed/metas";

const args = new Set(process.argv.slice(2));
const conhecidos = ["--aplicar", "--limpar-demo", "--manter-outros"];
const desconhecidos = [...args].filter((a) => !conhecidos.includes(a));
if (desconhecidos.length) {
  console.error(`Opção desconhecida: ${desconhecidos.join(", ")}. Opções: ${conhecidos.join(", ")}`);
  process.exit(1);
}

const prisma = new PrismaClient();
const aplicar = args.has("--aplicar");

cargaMetas(prisma, {
  aplicar,
  limparDemo: args.has("--limpar-demo"),
  desativarOutros: !args.has("--manter-outros"),
  log: (m) => console.log(m),
})
  .then((r) => {
    console.log("\nResumo:");
    for (const [k, v] of Object.entries(r.contagem)) console.log(`  ${k}: ${v}`);
    if (r.avisos.length) {
      console.log("\nAvisos:");
      for (const a of r.avisos) console.log(`  - ${a}`);
    }
    console.log(
      r.aplicado
        ? "\nCarga gravada."
        : "\nSIMULAÇÃO: nada foi gravado. Confira o relatório acima e rode de novo com --aplicar para gravar.",
    );
  })
  .catch((e) => {
    console.error("\nA carga falhou e nada foi gravado:");
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
