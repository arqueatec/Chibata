import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { loginWithPassword, requestMagicLink } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">A</div>
        <h1 className="text-xl font-bold">ArqueaTec · Desempenho</h1>
        <p className="text-sm text-slate-500">Acompanhamento diário da equipe</p>
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
