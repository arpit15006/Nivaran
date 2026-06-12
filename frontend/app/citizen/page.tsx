'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Camera, Send, Crosshair, ChevronDown } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Alert, Card, EmptyState, SeverityBadge, Spinner, StatusBadge } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { uploadMedia } from '@/lib/upload';
import { prettyCategory, timeAgo, STATUS_META } from '@/lib/format';
import type { AuditEvent, Complaint } from '@/lib/types';

const LocationPicker = dynamic(() => import('@/components/LocationPicker'), {
  ssr: false,
  loading: () => <div className="grid h-[280px] place-items-center rounded-xl border border-line-strong"><Spinner label="Loading map…" /></div>,
});

const PhotoCapture = dynamic(() => import('@/components/PhotoCapture'), { ssr: false });

export default function CitizenPage() {
  return (
    <AppShell requireRoles={['CITIZEN', 'ADMIN']}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ReportForm />
        <MyComplaints />
      </div>
    </AppShell>
  );
}

function ReportForm() {
  const [text, setText] = useState('');
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Complaint | null>(null);

  function useMyLocation() {
    setError(null);
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setError('Your browser does not support location. Tap the map to set it manually.');
      return;
    }
    // Geolocation needs a secure context: https:// or localhost (not a LAN IP).
    if (!window.isSecureContext) {
      setError('Location needs a secure connection — open the app via http://localhost, or tap the map to set it.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was blocked. Allow it in your browser, or tap the map to set it.'
            : err.code === err.TIMEOUT
              ? 'Timed out getting your location. Try again or tap the map.'
              : 'Could not read your location — tap the map instead.';
        setError(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!photo) {
      setError('A photo of the problem is required. Use “Take photo” or “Upload”.');
      return;
    }
    if (!loc) {
      setError('Please set the location by tapping the map or using your current location.');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const photoKey = (await uploadMedia('photo', photo)) ?? undefined;
      if (!photoKey) {
        setError('Photo upload failed (media storage not configured). Please try again.');
        setBusy(false);
        return;
      }
      const { complaint } = await api<{ complaint: Complaint }>('/complaints', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: { rawText: text, lat: loc.lat, lng: loc.lng, photoKey },
      });
      setResult(complaint);
      setText('');
      setPhoto(null);
      window.dispatchEvent(new CustomEvent('nivaran:refresh-complaints'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your report');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <p className="eyebrow">Citizen · New report</p>
      <h1 className="mt-1 font-heading text-2xl font-semibold text-ink-900">Report a problem</h1>
      <p className="mt-1 text-sm text-ink-500">Describe the issue in your own words. We classify and route it to the right department automatically.</p>

      <form onSubmit={onSubmit} className="mt-5 space-y-5">
        {error ? <Alert>{error}</Alert> : null}
        {result ? (
          <Alert kind="success">
            Routed to <strong>{result.department ?? 'human triage'}</strong> as{' '}
            <strong>{prettyCategory(result.category)}</strong>. Track it in your list →
          </Alert>
        ) : null}

        <div>
          <label htmlFor="desc" className="label">What&apos;s the issue?</label>
          <textarea
            id="desc" required minLength={5} rows={4} value={text}
            onChange={(e) => setText(e.target.value)}
            className="input resize-none"
            placeholder="e.g. There's a large pothole near the bus stop on MG Road, water collects in it."
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label mb-0 flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden /> Location</span>
            <button type="button" onClick={useMyLocation} disabled={locating} className="btn-ghost px-2 py-1 text-xs">
              <Crosshair className={`h-3.5 w-3.5 ${locating ? 'animate-spin' : ''}`} aria-hidden /> {locating ? 'Locating…' : 'Use my location'}
            </button>
          </div>
          <LocationPicker value={loc} onPick={(lat, lng) => setLoc({ lat, lng })} />
          <p className="mt-1.5 text-xs text-ink-500">
            {loc ? `Selected: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : 'Tap the map to drop a pin.'}
          </p>
        </div>

        <div>
          <span className="label flex items-center gap-1.5">
            <Camera className="h-4 w-4" aria-hidden /> Photo of the problem <span className="text-red-600">*</span>
          </span>
          <PhotoCapture value={photo} onChange={setPhoto} />
          <p className="mt-1.5 text-xs text-ink-500">Required — take a photo now or upload one from your device.</p>
        </div>

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Submitting…' : <>Submit report <Send className="h-4 w-4" aria-hidden /></>}
        </button>
      </form>
    </Card>
  );
}

function MyComplaints() {
  const [items, setItems] = useState<Complaint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { complaints } = await api<{ complaints: Complaint[] }>('/complaints/mine');
      setItems(complaints);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your complaints');
    }
  }, []);

  useEffect(() => {
    load();
    const onRefresh = () => load();
    window.addEventListener('nivaran:refresh-complaints', onRefresh);
    const t = setInterval(load, 15000); // live status: poll every 15s
    return () => {
      window.removeEventListener('nivaran:refresh-complaints', onRefresh);
      clearInterval(t);
    };
  }, [load]);

  return (
    <div>
      <h2 className="mb-3 font-heading text-xl font-semibold text-ink-900">Your complaints</h2>
      {error ? <Alert>{error}</Alert> : null}
      {items === null ? (
        <Card className="p-6"><Spinner /></Card>
      ) : items.length === 0 ? (
        <EmptyState title="No complaints yet" hint="Submit your first report on the left." />
      ) : (
        <div className="space-y-3">
          {items.map((c) => <ComplaintRow key={c.id} complaint={c} />)}
        </div>
      )}
    </div>
  );
}

function ComplaintRow({ complaint }: { complaint: Complaint }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);

  async function toggle() {
    setOpen((o) => !o);
    if (!events) {
      try {
        const { events } = await api<{ events: AuditEvent[] }>(`/complaints/${complaint.id}/events`);
        setEvents(events);
      } catch {
        setEvents([]);
      }
    }
  }

  const deadline = useMemo(() => (complaint.slaDeadline ? new Date(complaint.slaDeadline) : null), [complaint.slaDeadline]);

  return (
    <Card className="overflow-hidden">
      <button onClick={toggle} className="flex w-full items-start gap-3 p-4 text-left hover:bg-paper-sunken" aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading font-semibold text-ink-900">{prettyCategory(complaint.category)}</span>
            <StatusBadge status={complaint.status} />
            <SeverityBadge severity={complaint.severity} />
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-ink-500">{complaint.rawText}</p>
          <p className="mt-1.5 text-xs text-ink-500">
            {complaint.department ? `→ ${complaint.department}` : 'Awaiting triage'} · {complaint.ward ?? 'Location set'} · {timeAgo(complaint.createdAt)}
            {deadline ? ` · due ${deadline.toLocaleString()}` : ''}
          </p>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-ink-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open ? (
        <div className="border-t border-line bg-paper-sunken p-4">
          <p className="eyebrow mb-2">Audit trail</p>
          {events === null ? <Spinner /> : <Timeline events={events} />}
        </div>
      ) : null}
    </Card>
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
            <p className="mono text-2xs">{new Date(e.createdAt).toLocaleString('en-GB')}</p>
            {detailLine(e) ? <p className="mt-0.5 text-xs text-ink-700">{detailLine(e)}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function kindColor(kind: string): string {
  return (
    { CLASSIFIED: '#475569', ROUTED: '#2F4A66', ESCALATED: '#EA580C', BREACHED: '#DC2626', RESOLVED: '#166534' } as Record<string, string>
  )[kind] ?? STATUS_META.NEW.color;
}
function kindLabel(kind: string): string {
  return (
    { CLASSIFIED: 'Classified by AI', ROUTED: 'Routed to department', ESCALATED: 'Escalated', BREACHED: 'SLA breached', RESOLVED: 'Resolved', STATUS_CHANGE: 'Status updated', VIEWED: 'Reviewed by official' } as Record<string, string>
  )[kind] ?? kind;
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
