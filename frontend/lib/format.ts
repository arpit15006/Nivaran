import type { Status } from './types';

// color = foreground/dot (vivid status color, also used for map pins).
// bg/border = chip tints. Status colors are RESERVED for status only.
export const STATUS_META: Record<Status, { label: string; color: string; bg: string; border: string }> = {
  NEW: { label: 'New', color: '#475569', bg: '#F0F1F4', border: '#E1E4EA' },
  TRIAGE: { label: 'Triage', color: '#92500E', bg: '#FAF1E1', border: '#EDDDBE' },
  ROUTED: { label: 'Routed', color: '#2F4A66', bg: '#E9F0F6', border: '#D1DFEC' },
  IN_PROGRESS: { label: 'In progress', color: '#92400E', bg: '#FBF0DB', border: '#F0DDB6' },
  BREACHED: { label: 'Breached', color: '#B91C1C', bg: '#FBE8E8', border: '#F2CECE' },
  ESCALATED: { label: 'Escalated', color: '#C2410C', bg: '#FCEADC', border: '#F5D3B9' },
  RESOLVED: { label: 'Resolved', color: '#166534', bg: '#E6F2EA', border: '#C8E2D1' },
  CLOSED: { label: 'Closed', color: '#475569', bg: '#ECEEF1', border: '#DFE2E8' },
};

export const SEVERITY_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  LOW: { label: 'Low', color: '#166534', bg: '#E6F2EA', border: '#C8E2D1' },
  MEDIUM: { label: 'Medium', color: '#92400E', bg: '#FBF0DB', border: '#F0DDB6' },
  HIGH: { label: 'High', color: '#C2410C', bg: '#FCEADC', border: '#F5D3B9' },
  CRITICAL: { label: 'Critical', color: '#B91C1C', bg: '#FBE8E8', border: '#F2CECE' },
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
