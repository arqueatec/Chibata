import Image from "next/image";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { loginWithPassword, requestMagicLink } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-brand-50 to-slate-50" />
      <div className="mb-6 text-center">
        <Image src="/logo-arqueatec.png" alt="ArqueaTec" width={224} height={82} priority className="mx-auto mb-4 h-auto w-56" />
        <h1 className="text-xl font-bold text-brand-600">Acompanhamento de desempenho</h1>
        <p className="text-sm text-slate-500">Check-in, metas e indicadores da equipe</p>
      </div>
      <div className="card space-y-6">
        <ActionForm action={loginWithPassword}>
          <div>
            <label className="label" htmlFor="email">E-mail</label>
            <input id="email" name="email" type="email" autoComplete="email" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">Senha</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
          </div>
          <SubmitButton className="btn-primary w-full" pendingText="Entrando…">Entrar</SubmitButton>
        </ActionForm>
        <div className="relative text-center text-xs text-slate-400">
          <span className="bg-white px-2">ou receba um link por e-mail</span>
        </div>
        <ActionForm action={requestMagicLink}>
          <div>
            <label className="label" htmlFor="magic-email">E-mail</label>
            <input id="magic-email" name="email" type="email" autoComplete="email" required className="input" />
          </div>
          <SubmitButton className="btn-secondary w-full" pendingText="Enviando…">Enviar link de acesso</SubmitButton>
        </ActionForm>
      </div>
      <p className="mt-6 text-center text-xs text-slate-500">
        Coletamos apenas dados necessários à gestão do trabalho. Você pode ver e exportar tudo o que é registrado sobre você em “Meus dados”.
      </p>
    </main>
  );
}
