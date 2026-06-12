'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, MapPin, Cpu, Clock, ShieldCheck, Image as ImageIcon, CheckCircle2, PlayCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { prettyCategory, timeAgo, STATUS_META } from '@/lib/format';
import { SeverityBadge, StatusBadge, Spinner, Alert } from './ui';
import type { AuditEvent, Complaint, Status } from '@/lib/types';

interface DetailComplaint extends Complaint {
  photoUrl?: string | null;
  voiceUrl?: string | null;
}

/**
 * Full complaint detail for officials/authorities/admins: description, location,
 * classifier reasoning, the uploaded photo/voice (via signed URLs), and the
 * tamper-evident audit timeline. Opening it records a VIEWED audit event.
 */
export function ComplaintDetail({
  complaintId,
  onClose,
  onUpdated,
  canAct = false,
}: {
  complaintId: string;
  onClose: () => void;
  onUpdated?: () => void;
  canAct?: boolean;
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

  // Close on Escape.
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

  const done = complaint?.status === 'RESOLVED' || complaint?.status === 'CLOSED';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Complaint detail" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-card sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div className="min-w-0">
            {complaint ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-heading text-lg font-semibold text-ink-900">{prettyCategory(complaint.category)}</h2>
                  <StatusBadge status={complaint.status} />
                  <SeverityBadge severity={complaint.severity} />
                </div>
                <p className="mt-1 text-xs text-ink-500">Filed {timeAgo(complaint.createdAt)}{complaint.reporter?.name ? ` · by ${complaint.reporter.name}` : ''}</p>
              </>
            ) : (
              <h2 className="font-heading text-lg font-semibold text-ink-900">Complaint</h2>
            )}
          </div>
          <button onClick={onClose} className="btn-ghost px-2" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {error ? <Alert>{error}</Alert> : null}
          {!complaint ? (
            <Spinner label="Loading complaint…" />
          ) : (
            <div className="space-y-5">
              {/* Photo */}
              <section>
                <SectionTitle icon={<ImageIcon className="h-4 w-4" />}>Photo evidence</SectionTitle>
                {complaint.hasPhoto && complaint.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a href={complaint.photoUrl} target="_blank" rel="noreferrer">
                    <img src={complaint.photoUrl} alt={`Photo for ${prettyCategory(complaint.category)} complaint`} className="max-h-80 w-full rounded-xl border border-slate-200 object-cover" />
                  </a>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-ink-500">No photo was attached to this complaint.</p>
                )}
                {complaint.hasVoice && complaint.voiceUrl ? (
                  <audio controls src={complaint.voiceUrl} className="mt-3 w-full" />
                ) : null}
              </section>

              {/* Description */}
              <section>
                <SectionTitle>Citizen&apos;s description</SectionTitle>
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-ink-700">{complaint.rawText}</p>
              </section>

              {/* Facts grid */}
              <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Fact icon={<MapPin className="h-4 w-4" />} label="Location">
                  {complaint.ward ?? 'Outside known wards'}
                  <span className="block text-xs text-ink-500">{complaint.lat.toFixed(5)}, {complaint.lng.toFixed(5)} · {complaint.jurisdiction}</span>
                </Fact>
                <Fact icon={<ShieldCheck className="h-4 w-4" />} label="Routed to">
                  {complaint.department ?? 'Human triage'}
                </Fact>
                <Fact icon={<Cpu className="h-4 w-4" />} label="AI classification">
                  {complaint.classifierSource === 'llm' ? 'LLM' : 'Keyword fallback'}
                  <span className="block text-xs text-ink-500">{complaint.classifierConfidence !== null ? `${Math.round(complaint.classifierConfidence * 100)}% confidence` : '—'}</span>
                </Fact>
                <Fact icon={<Clock className="h-4 w-4" />} label="SLA deadline">
                  {complaint.slaDeadline ? new Date(complaint.slaDeadline).toLocaleString() : '—'}
                  {complaint.escalationLevel > 0 ? <span className="block text-xs font-semibold text-orange-700">Escalation level {complaint.escalationLevel}</span> : null}
                </Fact>
              </section>

              {/* Timeline */}
              <section>
                <SectionTitle>Audit timeline</SectionTitle>
                {events === null ? <Spinner /> : <Timeline events={events} />}
              </section>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {canAct && complaint && !done ? (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 p-4">
            {complaint.status !== 'IN_PROGRESS' ? (
              <button onClick={() => setStatus('IN_PROGRESS')} disabled={acting} className="btn-secondary">
                <PlayCircle className="h-4 w-4" aria-hidden /> Mark in progress
              </button>
            ) : null}
            <button onClick={() => setStatus('RESOLVED')} disabled={acting} className="btn-primary">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> {acting ? 'Saving…' : 'Resolve'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
      {icon}{children}
    </h3>
  );
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">{icon}{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-900">{children}</p>
    </div>
  );
}

function Timeline({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-ink-500">No events recorded.</p>;
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: kindColor(e.kind) }} aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-900">{kindLabel(e.kind)}</p>
            <p className="text-xs text-ink-500">{new Date(e.createdAt).toLocaleString()}</p>
            {detailLine(e) ? <p className="mt-0.5 text-xs text-ink-700">{detailLine(e)}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function kindColor(kind: string): string {
  return ({ CLASSIFIED: '#475569', ROUTED: '#0369A1', ESCALATED: '#EA580C', BREACHED: '#DC2626', RESOLVED: '#16A34A', VIEWED: '#7C3AED' } as Record<string, string>)[kind] ?? STATUS_META.NEW.color;
}
function kindLabel(kind: string): string {
  return ({ CLASSIFIED: 'Classified by AI', ROUTED: 'Routed to department', ESCALATED: 'Escalated', BREACHED: 'SLA breached', RESOLVED: 'Resolved', STATUS_CHANGE: 'Status updated', VIEWED: 'Reviewed by official' } as Record<string, string>)[kind] ?? kind;
}
function detailLine(e: AuditEvent): string {
  const d = e.detail ?? {};
  if (e.kind === 'CLASSIFIED') return `${d.category ?? ''} · ${d.jurisdiction ?? ''}${d.ward ? ` · ${d.ward}` : ''}`;
  if (e.kind === 'ROUTED') return typeof d.reason === 'string' ? d.reason : '';
  if (e.kind === 'ESCALATED') return `→ ${d.authority ?? 'next authority'}`;
  if (typeof d.note === 'string') return d.note;
  if (typeof d.reason === 'string') return d.reason;
  return '';
}
