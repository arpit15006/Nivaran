'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, PlayCircle } from 'lucide-react';
import { Eye } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { ComplaintDetail } from '@/components/ComplaintDetail';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { Alert, Card, EmptyState, SeverityBadge, Spinner, StatusBadge } from '@/components/ui';
import { prettyCategory, timeAgo, timeLeft } from '@/lib/format';
import type { QueueItem, Status } from '@/lib/types';

interface Dept { id: string; name: string; jurisdiction: string; _count?: { complaints: number } }

export default function OfficialPage() {
  return (
    <AppShell requireRoles={['OFFICIAL', 'AUTHORITY', 'ADMIN']}>
      <QueueView />
    </AppShell>
  );
}

function QueueView() {
  const { user } = useAuth();
  const [depts, setDepts] = useState<Dept[]>([]);
  const [deptId, setDeptId] = useState<string | null>(user?.departmentId ?? null);
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // Admin/authority pick a department; officials are pinned to their own.
  useEffect(() => {
    if (user?.role === 'OFFICIAL') return;
    api<{ departments: Dept[] }>('/departments')
      .then(({ departments }) => {
        setDepts(departments);
        setDeptId((cur) => cur ?? departments[0]?.id ?? null);
      })
      .catch(() => setError('Could not load departments'));
  }, [user?.role]);

  const load = useCallback(async () => {
    if (!deptId) return;
    try {
      const q = filter ? `?status=${filter}` : '';
      const { queue } = await api<{ queue: QueueItem[] }>(`/departments/${deptId}/queue${q}`);
      setItems(queue);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the queue');
    }
  }, [deptId, filter]);

  useEffect(() => {
    setItems(null);
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [load]);

  async function updateStatus(id: string, status: Status) {
    try {
      await api(`/complaints/${id}/status`, { method: 'PATCH', body: { status } });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    }
  }

  const nearBreachCount = items?.filter((i) => i.nearBreach && !['RESOLVED', 'CLOSED'].includes(i.status)).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Operations · Department queue</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold text-ink-900">Active complaints</h1>
          <p className="mt-1 text-sm text-ink-500">Ordered by time-to-breach. Resolve before the SLA runs out.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user?.role !== 'OFFICIAL' && depts.length > 0 ? (
            <select value={deptId ?? ''} onChange={(e) => setDeptId(e.target.value)} className="input max-w-[16rem]" aria-label="Department">
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          ) : null}
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input max-w-[12rem]" aria-label="Filter by status">
            <option value="">All open</option>
            <option value="ROUTED">Routed</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="ESCALATED">Escalated</option>
            <option value="BREACHED">Breached</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {nearBreachCount > 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-status-escalated/30 bg-status-escalated/5 px-4 py-3 text-sm font-semibold text-status-escalated">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          {nearBreachCount} complaint{nearBreachCount > 1 ? 's' : ''} near or past their SLA deadline.
        </div>
      ) : null}

      {items === null ? (
        <Card className="p-8"><Spinner label="Loading queue…" /></Card>
      ) : items.length === 0 ? (
        <EmptyState title="Queue is clear" hint="No complaints match this filter." />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-paper-sunken text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3">Complaint</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">SLA</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((i) => (
                  <tr key={i.id} className={i.overdue ? 'bg-red-50/50' : i.nearBreach ? 'bg-orange-50/40' : ''}>
                    <td className="px-4 py-3">
                      <button onClick={() => setOpenId(i.id)} className="cursor-pointer text-left hover:underline">
                        <p className="font-semibold text-ink-900">{prettyCategory(i.category)}</p>
                      </button>
                      <p className="line-clamp-1 max-w-md text-ink-500">{i.rawText}</p>
                      <p className="text-xs text-ink-500">{i.ward ?? 'Outside wards'} · {timeAgo(i.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3"><SeverityBadge severity={i.severity} /></td>
                    <td className="px-4 py-3"><StatusBadge status={i.status} /></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-sm font-semibold ${i.overdue ? 'text-red-700' : i.nearBreach ? 'text-orange-700' : 'text-ink-700'}`}>
                        <Clock className="h-3.5 w-3.5" aria-hidden /> {timeLeft(i.msLeft)}
                      </span>
                      {i.escalationLevel > 0 ? <p className="text-xs font-semibold text-orange-700">Level {i.escalationLevel}</p> : null}
                    </td>
                    <td className="px-4 py-3"><RowActions item={i} onUpdate={updateStatus} onView={() => setOpenId(i.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {items.map((i) => (
              <Card key={i.id} className={`p-4 ${i.overdue ? 'border-red-200' : i.nearBreach ? 'border-orange-200' : ''}`}>
                <button onClick={() => setOpenId(i.id)} className="w-full text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-heading font-semibold text-ink-900">{prettyCategory(i.category)}</span>
                    <StatusBadge status={i.status} />
                    <SeverityBadge severity={i.severity} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-500">{i.rawText}</p>
                </button>
                <p className={`mt-1.5 inline-flex items-center gap-1 text-sm font-semibold ${i.overdue ? 'text-red-700' : i.nearBreach ? 'text-orange-700' : 'text-ink-700'}`}>
                  <Clock className="h-3.5 w-3.5" aria-hidden /> {timeLeft(i.msLeft)}
                </p>
                <div className="mt-3"><RowActions item={i} onUpdate={updateStatus} onView={() => setOpenId(i.id)} /></div>
              </Card>
            ))}
          </div>
        </>
      )}

      {openId ? (
        <ComplaintDetail complaintId={openId} canAct canSimulate={user?.role === 'ADMIN'} onClose={() => setOpenId(null)} onUpdated={load} />
      ) : null}
    </div>
  );
}

function RowActions({ item, onUpdate, onView }: { item: QueueItem; onUpdate: (id: string, s: Status) => void; onView: () => void }) {
  const done = item.status === 'RESOLVED' || item.status === 'CLOSED';
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button onClick={onView} className="btn-secondary px-3 py-2 text-xs" aria-label="View details and photo">
        <Eye className="h-4 w-4" aria-hidden /> View
      </button>
      {done ? (
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-700"><CheckCircle2 className="h-4 w-4" aria-hidden /> Done</span>
      ) : (
        <>
          {item.status !== 'IN_PROGRESS' ? (
            <button onClick={() => onUpdate(item.id, 'IN_PROGRESS')} className="btn-secondary px-3 py-2 text-xs">
              <PlayCircle className="h-4 w-4" aria-hidden /> Start
            </button>
          ) : null}
          <button onClick={() => onUpdate(item.id, 'RESOLVED')} className="btn-primary px-3 py-2 text-xs">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Resolve
          </button>
        </>
      )}
    </div>
  );
}
