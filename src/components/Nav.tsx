"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  mobile?: boolean;
}

function active(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function DesktopNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="hidden gap-1 md:flex" aria-label="Navegação principal">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${active(pathname, i.href) ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:text-slate-900"}`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const list = items.filter((i) => i.mobile);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 grid border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}
      aria-label="Navegação principal"
    >
      {list.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active(pathname, i.href) ? "text-brand-700" : "text-slate-500"}`}
        >
          <span aria-hidden className="text-lg leading-none">{i.icon}</span>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
