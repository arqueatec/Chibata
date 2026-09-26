import Link from "next/link";
import { DesktopNav, MobileNav, type NavItem } from "@/components/Nav";
import { requireAccess } from "@/lib/authz";
import { logout } from "@/app/actions/auth";
import { ROLE_LABEL } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, ctx } = await requireAccess();
  const leads = isAdmin || ctx.subordinates.size > 0;
  const items: NavItem[] = [
    { href: "/", label: "Início", icon: "⌂", mobile: true },
    { href: "/checkin", label: "Check-in", icon: "✓", mobile: true },
    { href: "/tarefas", label: "Tarefas", icon: "☰", mobile: true },
    { href: "/desempenho", label: "Desempenho", icon: "↗", mobile: true },
    leads
      ? { href: "/pessoas", label: "Pessoas", icon: "☺", mobile: true }
      : { href: `/pessoas/${user.id}`, label: "Meu perfil", icon: "☺", mobile: true },
    ...(isAdmin ? [{ href: "/admin", label: "Administração", icon: "⚙" }] : []),
    { href: "/meus-dados", label: "Meus dados", icon: "⛉" },
  ];
  return (
    <div className="min-h-dvh pb-20 md:pb-8">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 font-bold text-brand-700">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">A</span>
              <span className="hidden sm:inline">ArqueaTec</span>
            </Link>
            <DesktopNav items={items} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="hidden text-right leading-tight sm:block">
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-slate-500">{ROLE_LABEL[user.role]}</div>
            </div>
            {isAdmin && (
              <Link href="/admin" className="btn-secondary btn-sm md:hidden" aria-label="Administração">⚙</Link>
            )}
            <Link href="/meus-dados" className="btn-secondary btn-sm md:hidden">Meus dados</Link>
            <form action={logout}>
              <button className="btn-secondary btn-sm" type="submit">Sair</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-4 sm:py-6">{children}</main>
      <MobileNav items={items} />
    </div>
  );
}
