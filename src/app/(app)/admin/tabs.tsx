"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin/pessoas", label: "Pessoas" },
  { href: "/admin/areas", label: "Áreas e pesos" },
  { href: "/admin/indicadores", label: "Indicadores" },
  { href: "/admin/projetos", label: "Projetos e clientes" },
  { href: "/admin/auditoria", label: "Auditoria" },
  { href: "/admin/exportar", label: "Exportar" },
  { href: "/admin/asana", label: "Asana" },
  { href: "/admin/crm", label: "CRM" },
  { href: "/admin/carga", label: "Carga de metas" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 text-sm">
      {ITEMS.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`rounded-md px-3 py-1.5 font-medium whitespace-nowrap ${pathname.startsWith(i.href) ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
