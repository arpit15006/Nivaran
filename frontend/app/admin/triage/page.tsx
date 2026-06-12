'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wand2, Send, Eye } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ComplaintDetail } from '@/components/ComplaintDetail';
import { Alert, Card, EmptyState, SeverityBadge, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { prettyCategory, timeAgo } from '@/lib/format';

interface TriageItem {
  id: string;
  rawText: string;
  category: string;
  severity: string;
  ward: string | null;
  jurisdiction: string | null;
  lat: number;
  lng: number;
  classifierConfidence: number | null;
  classifierSource: string | null;
  reporter: string | null;
  hasPhoto: boolean;
  createdAt: string;
}
interface Dept { id: string; name: string; jurisdiction: string }

export default function TriagePage() {
  return (
    <AppShell requireRoles={['ADMIN']}>
      <TriageView />
    </AppShell>
  );
}

function TriageView() {
  const [items, setItems] = useState<TriageItem[] | null>(null);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [{ triage }, { departments }] = await Promise.all([
        api<{ triage: TriageItem[] }>('/admin/triage'),
        api<{ departments: Dept[] }>('/departments'),
      ]);
      setItems(triage);
      setDepts(departments);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the triage queue');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-ink-900">Human triage</h1>
        <p className="mt-1 text-sm text-ink-500">
          Complaints the engine could not route automatically (low classifier confidence or no matching rule).
          Re-run the engine after a rule change, or assign a department manually.
        </p>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {items === null ? (
        <Card className="p-8"><Spinner label="Loading triage…" /></Card>
      ) : items.length === 0 ? (
        <EmptyState title="Nothing in triage" hint="Every complaint has been routed." />
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <TriageCard key={i.id} item={i} depts={depts} onView={() => setOpenId(i.id)} onRouted={load} onError={setError} />
          ))}
        </div>
      )}

      {openId ? <ComplaintDetail complaintId={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function TriageCard({
  item, depts, onView, onRouted, onError,
}: {
  item: TriageItem;
  depts: Dept[];
  onView: () => void;
  onRouted: () => void;
  onError: (m: string) => void;
}) {
  const [deptId, setDeptId] = useState('');
  const [slaHours, setSlaHours] = useState(48);
  const [busy, setBusy] = useState<'auto' | 'manual' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function route(mode: 'auto' | 'manual') {
    setBusy(mode);
    setNote(null);
    try {
      const body = mode === 'auto' ? { mode } : { mode, departmentId: deptId || depts[0]?.id, slaHours: Number(slaHours) };
      const { complaint } = await api<{ complaint: { department: string | null } }>(`/admin/complaints/${item.id}/route`, { method: 'POST', body });
      setNote(`Routed to ${complaint.department}.`);
      setTimeout(onRouted, 700);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Routing failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading font-semibold text-ink-900">{prettyCategory(item.category)}</span>
            <SeverityBadge severity={item.severity} />
            {item.classifierConfidence !== null ? (
              <span className="chip bg-paper-sunken text-ink-700">
                {item.classifierSource === 'llm' ? 'AI' : 'fallback'} {Math.round(item.classifierConfidence * 100)}%
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-ink-500">{item.rawText}</p>
          <p className="mt-1 text-xs text-ink-500">
            {item.ward ?? 'Outside known wards'} · {item.jurisdiction ?? '—'} · {item.reporter ?? 'citizen'} · {timeAgo(item.createdAt)}
          </p>
        </div>
        <button onClick={onView} className="btn-secondary px-3 py-2 text-xs"><Eye className="h-4 w-4" aria-hidden /> View{item.hasPhoto ? ' photo' : ''}</button>
      </div>

      {note ? <p className="mt-3 text-sm font-semibold text-green-700">{note}</p> : null}

      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-end sm:justify-between">
        <button onClick={() => route('auto')} disabled={busy !== null} className="btn-primary">
          <Wand2 className="h-4 w-4" aria-hidden /> {busy === 'auto' ? 'Re-routing…' : 'Auto re-route (run engine)'}
        </button>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label text-xs" htmlFor={`dep-${item.id}`}>Or assign to</label>
            <select id={`dep-${item.id}`} value={deptId} onChange={(e) => setDeptId(e.target.value)} className="input max-w-[14rem] py-2 text-sm">
              <option value="">Select department…</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-xs" htmlFor={`sla-${item.id}`}>SLA (h)</label>
            <input id={`sla-${item.id}`} type="number" min={1} max={720} value={slaHours} onChange={(e) => setSlaHours(Number(e.target.value))} className="input w-20 py-2 text-sm" />
          </div>
          <button onClick={() => route('manual')} disabled={busy !== null} className="btn-secondary">
            <Send className="h-4 w-4" aria-hidden /> {busy === 'manual' ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </div>
    </Card>
  );
}
