import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { consumeMagicLink } from "@/app/actions/auth";

export const metadata = { title: "Confirmar acesso" };

// O token só é consumido no POST (botão), para que pré-visualizadores de links de e-mail não o invalidem.
export default async function MagicPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <div className="card space-y-4 text-center">
        <h1 className="text-lg font-bold">Confirmar acesso</h1>
        {token ? (
          <ActionForm action={consumeMagicLink}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton className="btn-primary w-full" pendingText="Entrando…">Entrar no ArqueaTec Desempenho</SubmitButton>
          </ActionForm>
        ) : (
          <p className="text-sm text-slate-600">Link inválido.</p>
        )}
        <a href="/login" className="link text-sm">Voltar ao login</a>
      </div>
    </main>
  );
}
