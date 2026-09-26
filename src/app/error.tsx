"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-bold">Algo deu errado</h1>
      <p className="text-sm text-slate-600">Não foi possível carregar esta página. Tente novamente em instantes.</p>
      {error.digest && <p className="text-xs text-slate-400">Código: {error.digest}</p>}
      <button onClick={reset} className="btn-primary">Tentar novamente</button>
    </main>
  );
}
