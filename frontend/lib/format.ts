import type { Status } from './types';

export const STATUS_META: Record<Status, { label: string; color: string; bg: string }> = {
  NEW: { label: 'New', color: '#475569', bg: '#F1F5F9' },
  TRIAGE: { label: 'Human triage', color: '#475569', bg: '#F1F5F9' },
  ROUTED: { label: 'Routed', color: '#075985', bg: '#E0F2FE' },
  IN_PROGRESS: { label: 'In progress', color: '#6D28D9', bg: '#F3E8FF' },
  BREACHED: { label: 'SLA breached', color: '#B91C1C', bg: '#FEE2E2' },
  ESCALATED: { label: 'Escalated', color: '#C2410C', bg: '#FFEDD5' },
  RESOLVED: { label: 'Resolved', color: '#15803D', bg: '#DCFCE7' },
  CLOSED: { label: 'Closed', color: '#334155', bg: '#E2E8F0' },
};

export const SEVERITY_META: Record<string, { label: string; color: string; bg: string }> = {
  LOW: { label: 'Low', color: '#15803D', bg: '#DCFCE7' },
  MEDIUM: { label: 'Medium', color: '#B45309', bg: '#FEF3C7' },
  HIGH: { label: 'High', color: '#C2410C', bg: '#FFEDD5' },
  CRITICAL: { label: 'Critical', color: '#B91C1C', bg: '#FEE2E2' },
};

export function prettyCategory(c: string): string {
  return c.toLowerCase().split('_').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ');
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function timeLeft(ms: number | null): string {
  if (ms === null) return '—';
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60000);
  const text = h >= 1 ? `${h}h ${m}m` : `${m}m`;
  return ms < 0 ? `${text} overdue` : `${text} left`;
}
