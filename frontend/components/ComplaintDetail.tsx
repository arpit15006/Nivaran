'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  X, MapPin, Cpu, Clock, ShieldCheck, Image as ImageIcon, CheckCircle2, PlayCircle, Zap, TrendingUp, Building2,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { prettyCategory, timeAgo, STATUS_META } from '@/lib/format';
import { SeverityBadge, StatusBadge, Spinner, Alert, Mono } from './ui';
import type { AuditEvent, Complaint, Status } from '@/lib/types';

interface DetailComplaint extends Complaint {
  photoUrl?: string | null;
  voiceUrl?: string | null;
}

export function ComplaintDetail({
  complaintId, onClose, onUpdated, canAct = false, canSimulate = false,
}: {
  complaintId: string;
  onClose: () => void;
  onUpdated?: () => void;
  canAct?: boolean;
  canSimulate?: boolean;
}) {
  const [complaint, setComplaint] = useState<DetailComplaint | null>(null);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ complaint }, { events }] = await Promise.all([
        api<{ complaint: DetailComplaint }>(`/complaints/${complaintId}`),
        api<{ events: AuditEvent[] }>(`/complaints/${complaintId}/events`),
      ]);
      setComplaint(complaint);
      setEvents(events);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load complaint');
    }
  }, [complaintId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function setStatus(status: Status) {
    setActing(true);
    try {
      await api(`/complaints/${complaintId}/status`, { method: 'PATCH', body: { status } });
      await load();
      onUpdated?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setActing(false);
    }
  }

  async function breachNow() {
    setActing(true);
    setError(null);
    try {
      await api(`/admin/complaints/${complaintId}/breach-now`, { method: 'POST' });
      setTimeout(load, 4000); // let the agent reason + act, then refresh
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not force breach');
    } finally {
      setActing(false);
    }
  }

  const done = complaint?.status === 'RESOLVED' || complaint?.status === 'CLOSED';
  const escalations = (events ?? []).filter((e) => e.kind === 'ESCALATED');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Complaint detail" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-lg border border-line bg-paper-card shadow-pop sm:rounded-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line bg-paper-sunken/60 p-5">
          <div className="min-w-0">
            {complaint ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-lg font-semibold text-ink-900">{prettyCategory(complaint.category)}</h2>
                  <StatusBadge status={complaint.status} />
                  <SeverityBadge severity={complaint.severity} />
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Mono>#{complaint.id.slice(-8)}</Mono>
                  <span className="text-ink-300">·</span>
                  <span className="text-xs text-ink-500">filed {timeAgo(complaint.createdAt)}{complaint.reporter?.name ? ` by ${complaint.reporter.name}` : ''}</span>
                </p>
              </>
            ) : (
              <h2 className="font-heading text-lg font-semibold text-ink-900">Complaint</h2>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-ink-500 hover:bg-paper-sunken" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
          {!complaint ? (
            <Spinner label="Loading complaint" />
          ) : (
            <div className="space-y-6">
              {/* Escalation chain — the signature: how the agent moved it up the chain. */}
              {escalations.length > 0 ? <EscalationChain complaint={complaint} escalations={escalations} /> : null}

              {/* Photo */}
              <section>
                <Eyebrow icon={<ImageIcon className="h-3.5 w-3.5" />}>Photo evidence</Eyebrow>
                {complaint.hasPhoto && complaint.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a href={complaint.photoUrl} target="_blank" rel="noreferrer">
                    <img src={complaint.photoUrl} alt={`Photo for ${prettyCategory(complaint.category)} complaint`} className="max-h-80 w-full rounded-md border border-line object-cover" />
                  </a>
                ) : (
                  <p className="card-sunken px-4 py-6 text-center text-sm text-ink-500">No photo attached.</p>
                )}
                {complaint.hasVoice && complaint.voiceUrl ? <audio controls src={complaint.voiceUrl} className="mt-3 w-full" /> : null}
              </section>

              {/* Description */}
              <section>
                <Eyebrow>Citizen&apos;s description</Eyebrow>
                <p className="rounded-md border border-line bg-paper-sunken/50 px-4 py-3 text-sm text-ink-800">{complaint.rawText}</p>
              </section>

              {/* Facts */}
              <section className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
                <Fact 
                  icon={<MapPin className="h-3.5 w-3.5" />} 
                  label="Location"
                  onClick={() => window.open(`https://www.openstreetmap.org/?mlat=${complaint.lat}&mlon=${complaint.lng}#map=17/${complaint.lat}/${complaint.lng}`, '_blank')}
                >
                  <span className="text-ink-900">{complaint.ward ?? 'Outside mapped wards'}</span>
                  <span className="mt-0.5 block font-mono text-2xs text-ink-500 hover:text-primary-600 transition-colors">{complaint.lat.toFixed(5)}, {complaint.lng.toFixed(5)} · {complaint.jurisdiction}</span>
                </Fact>
                <Fact icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Routed to">
                  {complaint.department ?? 'Human triage'}
                </Fact>
                <Fact icon={<Cpu className="h-3.5 w-3.5" />} label="AI classification">
                  {complaint.classifierSource === 'llm' ? 'LLM' : 'Keyword fallback'}
                  <span className="mt-0.5 block font-mono text-2xs text-ink-500">{complaint.classifierConfidence !== null ? `${Math.round(complaint.classifierConfidence * 100)}% confidence` : '—'}</span>
                </Fact>
                <Fact icon={<Clock className="h-3.5 w-3.5" />} label="SLA deadline">
                  <span className="font-mono text-xs text-ink-900">{complaint.slaDeadline ? new Date(complaint.slaDeadline).toLocaleString('en-GB') : '—'}</span>
                  {complaint.escalationLevel > 0 ? <span className="mt-0.5 block font-mono text-2xs font-semibold text-status-escalated">▲ ESCALATION L{complaint.escalationLevel}</span> : null}
                </Fact>
              </section>

              {/* Timeline */}
              <section>
                <Eyebrow>Audit trail</Eyebrow>
                {events === null ? <Spinner /> : <Timeline events={events} />}
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        {complaint && (canAct || canSimulate) && !done ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-paper-sunken/60 p-4">
            {canSimulate && complaint.departmentId ? (
              <button onClick={breachNow} disabled={acting} className="btn-ghost text-status-escalated hover:bg-status-escalated/10" title="Demo: force the SLA deadline to now so the escalation agent acts">
                <Zap className="h-4 w-4" aria-hidden /> Force SLA breach
              </button>
            ) : <span />}
            {canAct ? (
              <div className="flex items-center gap-2">
                {complaint.status !== 'IN_PROGRESS' ? (
                  <button onClick={() => setStatus('IN_PROGRESS')} disabled={acting} className="btn-secondary">
                    <PlayCircle className="h-4 w-4" aria-hidden /> In progress
                  </button>
                ) : null}
                <button onClick={() => setStatus('RESOLVED')} disabled={acting} className="btn-primary">
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> {acting ? 'Saving…' : 'Resolve'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Visualizes the agent walking the complaint up the escalation chain. */
function EscalationChain({ complaint, escalations }: { complaint: DetailComplaint; escalations: AuditEvent[] }) {
  const latest = escalations[escalations.length - 1];
  const d = (latest.detail ?? {}) as Record<string, unknown>;
  const byAgent = d.decidedBy === 'agent';

  const nodes = [
    { level: 0, label: complaint.department ?? 'Department', reached: true },
    ...escalations.map((e) => {
      const det = (e.detail ?? {}) as Record<string, unknown>;
      return { level: Number(det.toLevel), label: String(det.authority ?? `Level ${det.toLevel}`), reached: true };
    }),
  ];

  return (
    <section className="animate-rise overflow-hidden rounded-md border border-status-escalated/40 bg-status-escalated/5">
      <div className="flex items-center justify-between gap-2 border-b border-status-escalated/20 px-4 py-2.5">
        <span className="flex items-center gap-1.5 font-mono text-2xs font-semibold uppercase tracking-[0.16em] text-status-escalated">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Escalation chain
        </span>
        {byAgent ? (
          <span className="inline-flex items-center gap-1 rounded border border-signal/40 bg-signal/10 px-1.5 py-0.5 font-mono text-2xs font-semibold uppercase tracking-wider text-signal-700">
            <Cpu className="h-3 w-3" aria-hidden /> AI agent
          </span>
        ) : null}
      </div>

      <div className="flex items-stretch gap-1 overflow-x-auto px-4 py-3.5">
        {nodes.map((n, i) => {
          const active = i === nodes.length - 1;
          return (
            <div key={i} className="flex items-center gap-1">
              <div className={`flex min-w-[7rem] flex-col rounded border px-2.5 py-1.5 ${active ? 'border-status-escalated bg-status-escalated/10' : 'border-line bg-paper-card'}`}>
                <span className="flex items-center gap-1 font-mono text-2xs font-semibold uppercase tracking-wider text-ink-500">
                  {n.level === 0 ? <Building2 className="h-3 w-3" aria-hidden /> : <TrendingUp className="h-3 w-3" aria-hidden />} L{n.level}
                  {active ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-status-escalated" style={{ animation: 'live-dot 1.6s ease-in-out infinite' }} aria-hidden /> : null}
                </span>
                <span className="mt-0.5 truncate text-xs font-semibold text-ink-900">{n.label}</span>
              </div>
              {i < nodes.length - 1 ? <span className="font-mono text-status-escalated" aria-hidden>→</span> : null}
            </div>
          );
        })}
      </div>

      {typeof d.reasoning === 'string' && d.reasoning ? (
        <div className="border-t border-status-escalated/20 px-4 py-3">
          <p className="flex items-center gap-1.5">
            <span className="eyebrow">Agent reasoning</span>
            {d.urgent ? <span className="chip" style={{ color: '#B91C1C', backgroundColor: '#FBE8E8', borderColor: '#F2CECE' }}>Urgent</span> : null}
            {Number(d.skippedLevels) > 0 ? <span className="chip" style={{ color: '#C2410C', backgroundColor: '#FCEADC', borderColor: '#F5D3B9' }}>Jumped {String(d.skippedLevels)}</span> : null}
          </p>
          <p className="mt-1.5 text-sm italic text-ink-700">“{String(d.reasoning)}”</p>
        </div>
      ) : null}
    </section>
  );
}

function Eyebrow({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return <h3 className="eyebrow mb-2 flex items-center gap-1.5">{icon}{children}</h3>;
}

function Fact({ icon, label, children, onClick }: { icon: React.ReactNode; label: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <div 
      className={`bg-paper-card p-3.5 ${onClick ? 'cursor-pointer hover:bg-paper-sunken/40 transition-colors' : ''}`}
      onClick={onClick}
      title={onClick ? 'Click to view exact location on OpenStreetMap' : undefined}
    >
      <p className="eyebrow flex items-center gap-1.5">{icon}{label}</p>
      <div className="mt-1 text-sm font-semibold text-ink-900">{children}</div>
    </div>
  );
}

function Timeline({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-ink-500">No events recorded.</p>;
  return (
    <ol className="relative space-y-3.5 border-l border-line pl-4">
      {events.map((e) => {
        const d = (e.detail ?? {}) as Record<string, unknown>;
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[1.3rem] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-paper-card" style={{ backgroundColor: kindColor(e.kind) }} aria-hidden />
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink-900">
              {kindLabel(e.kind)}
              {e.kind === 'ESCALATED' && d.decidedBy === 'agent' ? (
                <span className="inline-flex items-center gap-1 rounded border border-signal/40 bg-signal/10 px-1.5 py-px font-mono text-2xs font-semibold uppercase tracking-wider text-signal-700"><Cpu className="h-2.5 w-2.5" aria-hidden /> agent</span>
              ) : null}
            </p>
            <p className="mono text-2xs">{new Date(e.createdAt).toLocaleString('en-GB')}</p>
            {detailLine(e) ? <p className="mt-0.5 text-xs text-ink-600">{detailLine(e)}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

function kindColor(kind: string): string {
  return ({ CLASSIFIED: '#475569', ROUTED: '#2F4A66', ESCALATED: '#EA580C', BREACHED: '#DC2626', RESOLVED: '#166534', VIEWED: '#5A6A85' } as Record<string, string>)[kind] ?? STATUS_META.NEW.color;
}
function kindLabel(kind: string): string {
  return ({ CLASSIFIED: 'Classified by AI', ROUTED: 'Routed to department', ESCALATED: 'Escalated', BREACHED: 'SLA breached', RESOLVED: 'Resolved', STATUS_CHANGE: 'Status updated', VIEWED: 'Reviewed by official' } as Record<string, string>)[kind] ?? kind;
}
function detailLine(e: AuditEvent): string {
  const d = (e.detail ?? {}) as Record<string, unknown>;
  if (e.kind === 'CLASSIFIED') return `${d.category ?? ''} · ${d.jurisdiction ?? ''}${d.ward ? ` · ${d.ward}` : ''}`;
  if (e.kind === 'ROUTED') return typeof d.reason === 'string' ? d.reason : '';
  if (e.kind === 'ESCALATED') return `→ Level ${d.toLevel} — ${d.authority ?? 'next authority'}`;
  if (typeof d.note === 'string') return d.note;
  if (typeof d.reason === 'string') return d.reason;
  return '';
}
