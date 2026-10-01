import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { runSetup } from "@/app/actions/setup";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Configuração inicial" };

// Disponível apenas enquanto não houver nenhuma pessoa cadastrada.
export default async function SetupPage() {
  if ((await prisma.user.count()) > 0) notFound();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="card space-y-4">
        <div>
          <h1 className="text-xl font-bold">Configuração inicial</h1>
          <p className="text-sm text-slate-500">Esta página só aparece enquanto o sistema não tem nenhuma pessoa cadastrada.</p>
        </div>
        <ActionForm action={runSetup}>
          <div>
            <label className="label" htmlFor="secret">Código de configuração</label>
            <input id="secret" name="secret" type="password" required className="input" />
            <p className="hint">É o valor da variável CRON_SECRET configurada na Vercel.</p>
          </div>
          <fieldset className="space-y-2">
            <legend className="label">O que criar</legend>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="mode" value="demo" defaultChecked className="mt-1" />
              <span><strong>Dados de demonstração</strong>: as 6 pessoas da equipe, áreas, indicadores e 60 dias de check-ins fictícios.</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="mode" value="admin" className="mt-1" />
              <span><strong>Só o administrador</strong>: começa vazio; o resto é cadastrado pela tela de Administração.</span>
            </label>
          </fieldset>
          <div>
            <label className="label" htmlFor="name">Nome do administrador <span className="font-normal text-slate-400">(só no modo administrador)</span></label>
            <input id="name" name="name" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="email">E-mail do administrador <span className="font-normal text-slate-400">(só no modo administrador)</span></label>
            <input id="email" name="email" type="email" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">Senha inicial</label>
            <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
            <p className="hint">No modo demonstração, todas as 6 pessoas recebem esta senha.</p>
          </div>
          <SubmitButton className="btn-primary w-full" pendingText="Configurando… (pode levar até 1 minuto)">Configurar</SubmitButton>
        </ActionForm>
      </div>
    </main>
  );
}
