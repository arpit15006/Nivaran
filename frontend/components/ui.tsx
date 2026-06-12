import type { ReactNode } from 'react';
import { STATUS_META, SEVERITY_META } from '@/lib/format';
import type { Status } from '@/lib/types';

export function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span className="badge" style={{ color: m.color, backgroundColor: m.bg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} aria-hidden />
      {m.label}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const m = SEVERITY_META[severity] ?? SEVERITY_META.MEDIUM;
  return (
    <span className="badge" style={{ color: m.color, backgroundColor: m.bg }}>
      {m.label}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card p-5">
      <p className="text-sm font-medium text-ink-500">{label}</p>
      <p className="mt-1 font-heading text-3xl font-semibold text-ink-900">{value}</p>
      {sub ? <p className="mt-1 text-sm text-ink-500">{sub}</p> : null}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-ink-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-1 p-10 text-center">
      <p className="font-heading text-lg font-semibold text-ink-900">{title}</p>
      {hint ? <p className="text-sm text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'info' | 'success'; children: ReactNode }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-brand-100 bg-brand-50 text-brand-700',
    success: 'border-green-200 bg-green-50 text-green-800',
  }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}
