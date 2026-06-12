import type { ReactNode } from 'react';
import {
  Circle, AlertTriangle, ArrowRightCircle, Wrench, Octagon, TrendingUp, CheckCircle2, Archive, Minus,
} from 'lucide-react';
import { STATUS_META, SEVERITY_META } from '@/lib/format';
import type { Status } from '@/lib/types';

const STATUS_ICON: Record<Status, typeof Circle> = {
  NEW: Circle,
  TRIAGE: AlertTriangle,
  ROUTED: ArrowRightCircle,
  IN_PROGRESS: Wrench,
  BREACHED: Octagon,
  ESCALATED: TrendingUp,
  RESOLVED: CheckCircle2,
  CLOSED: Archive,
};

// Status is NEVER conveyed by colour alone — always dot + icon + text label.
export function StatusBadge({ status, className = '' }: { status: Status; className?: string }) {
  const m = STATUS_META[status];
  const Icon = STATUS_ICON[status];
  return (
    <span className={`chip ${className}`} style={{ color: m.color, backgroundColor: m.bg, borderColor: m.border }}>
      <Icon className="h-3 w-3" aria-hidden strokeWidth={2.5} />
      {m.label}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const m = SEVERITY_META[severity] ?? SEVERITY_META.MEDIUM;
  const Icon = severity === 'CRITICAL' ? Octagon : severity === 'HIGH' ? AlertTriangle : severity === 'LOW' ? Minus : Circle;
  return (
    <span className="chip" style={{ color: m.color, backgroundColor: m.bg, borderColor: m.border }}>
      <Icon className="h-3 w-3" aria-hidden strokeWidth={2.5} />
      {m.label}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

// Control-room stat tile — big mono-ish number, eyebrow label, optional trend note.
export function StatTile({
  label, value, sub, accent,
}: { label: string; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="card relative overflow-hidden p-5">
      {accent ? <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} aria-hidden /> : null}
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-heading text-3xl font-semibold tabular text-ink-900">{value}</p>
      {sub ? <p className="mt-1 text-sm text-ink-500">{sub}</p> : null}
    </div>
  );
}

// Backwards-compatible alias.
export const Stat = StatTile;

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-ink-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-signal" aria-hidden />
      <span className="font-mono text-xs uppercase tracking-wider">{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="card-sunken flex flex-col items-center justify-center gap-2 p-10 text-center">
      {icon ? <span className="text-ink-400" aria-hidden>{icon}</span> : null}
      <p className="font-heading text-lg font-semibold text-ink-900">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'info' | 'success'; children: ReactNode }) {
  const styles = {
    error: 'border-status-breached/30 bg-status-breached/5 text-status-breached',
    info: 'border-signal/30 bg-signal/5 text-signal-700',
    success: 'border-status-resolved/30 bg-status-resolved/5 text-status-resolved',
  }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-md border px-4 py-3 text-sm font-medium ${styles}`}>
      {children}
    </div>
  );
}

// A small monospace "system data" token (IDs, ward codes, hashes).
export function Mono({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`mono text-xs ${className}`}>{children}</span>;
}
