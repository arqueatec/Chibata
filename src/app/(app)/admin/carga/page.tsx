import { requireAdminPage } from "@/lib/authz";
import { Card } from "@/components/ui";
import { CargaForm } from "./form";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Administração · Carga de metas" };

export default async function AdminCarga() {
  // Autorização verificada também na página (layouts e páginas renderizam em paralelo)
  await requireAdminPage();
  return (
    <div className="space-y-4">
      <Card title="Carga de funções, indicadores e metas (out/2026 a mar/2027)">
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            Atualiza cargo, área e líder de cada pessoa, cria os indicadores e as metas da equipe e desativa os indicadores antigos. Pode ser executada
            mais de uma vez: atualiza o que já existe em vez de duplicar. Rode de novo no início de cada mês para atualizar a meta de litros.
          </p>
          <p>
            Use primeiro <strong>Simular</strong>: o relatório mostra tudo o que seria feito, sem gravar nada. Depois, <strong>Aplicar</strong>.
          </p>
        </div>
      </Card>
      <Card>
        <CargaForm />
      </Card>
    </div>
  );
}
