import Link from "next/link";
import type { ReactNode } from "react";
import { formatScore, scoreTone, STATUS_LABEL } from "@/lib/format";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = "", actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-slate-800">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  gray: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-800",
  yellow: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-sky-100 text-sky-800",
  brand: "bg-brand-100 text-brand-900",
} as const;

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const tone = status === "DONE" ? "green" : status === "BLOCKED" ? "red" : status === "IN_PROGRESS" ? "blue" : "gray";
  return (
    <span className="inline-flex gap-1">
      <Badge tone={tone}>{STATUS_LABEL[status] ?? status}</Badge>
      {overdue && <Badge tone="red">Atrasada</Badge>}
    </span>
  );
}

export function ScorePill({ value, label }: { value: number | null | undefined; label?: string }) {
  const tone = scoreTone(value);
  const cls = {
    good: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    warn: "bg-amber-50 text-amber-800 ring-amber-200",
    bad: "bg-red-50 text-red-800 ring-red-200",
    none: "bg-slate-50 text-slate-500 ring-slate-200",
  }[tone];
  return (
    <span className={`inline-flex items-baseline gap-1 rounded-lg px-2 py-0.5 text-sm font-semibold ring-1 ${cls}`} title={label}>
      {formatScore(value)}
      {label && <span className="text-xs font-normal">{label}</span>}
    </span>
  );
}

export function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-slate-400">sem comparação</span>;
  const up = value > 0;
  const same = value === 0;
  return (
    <span className={`text-xs font-medium ${same ? "text-slate-500" : up ? "text-emerald-700" : "text-red-700"}`}>
      {same ? "=" : up ? "▲" : "▼"} {Math.abs(value).toLocaleString("pt-BR")} pts vs. período anterior
    </span>
  );
}

export function ProgressBar({ value, max = 100 }: { value: number | null; max?: number }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const tone = scoreTone(value === null ? null : pct);
  const color = { good: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500", none: "bg-slate-300" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">{children}</p>;
}

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const inner = (
    <div className="card h-full">
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:opacity-90">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 text-sm">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          className={`rounded-md px-3 py-1.5 font-medium whitespace-nowrap ${i.key === current ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
