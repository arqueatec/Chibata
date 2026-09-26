import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="text-sm text-slate-600">O conteúdo não existe ou você não tem permissão para acessá-lo.</p>
      <Link href="/" className="btn-primary">Voltar ao início</Link>
    </main>
  );
}
