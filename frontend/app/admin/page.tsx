'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Activity, ShieldAlert, TimerReset, CheckCircle2, Settings, RefreshCw, Inbox, ArrowRight } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Alert, Card, Spinner, Stat } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { prettyCategory } from '@/lib/format';
import type { MapPoint } from '@/lib/types';

const CityMap = dynamic(() => import('@/components/CityMap'), {
  ssr: false,
  loading: () => <div className="grid h-[70vh] place-items-center rounded-2xl border border-slate-200"><Spinner label="Loading map…" /></div>,
});

interface Analytics {
  totals: { total: number; breached: number; escalated: number; resolved: number; breachRate: number; avgConfidence: number | null };
  byStatus: { status: string; count: number }[];
  byCategory: { category: string; count: number }[];
  byDepartment: { department: string; count: number }[];
  wardStats: { ward: string; zone: string; total: number; breached: number; breachRate: number }[];
}

export default function AdminPage() {
  return (
    <AppShell requireRoles={['ADMIN']}>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const [points, setPoints] = useState<MapPoint[] | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<{ accuracy: number; passed: boolean; correct: number; total: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [{ points }, a] = await Promise.all([
        api<{ points: MapPoint[] }>('/admin/map'),
        api<Analytics>('/admin/analytics'),
      ]);
      setPoints(points);
      setAnalytics(a);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load dashboard');
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function runAccuracy() {
    setAccuracy(null);
    try {
      const r = await api<{ accuracy: number; passed: boolean; correct: number; total: number }>('/admin/routing-accuracy', { method: 'POST' });
      setAccuracy(r);
    } catch {
      setError('Accuracy run failed');
    }
  }

  const triageCount = analytics?.byStatus.find((s) => s.status === 'TRIAGE')?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-ink-900">City dashboard</h1>
          <p className="mt-1 text-sm text-ink-500">Live, city-wide view of every complaint, with breach analytics.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-secondary"><RefreshCw className="h-4 w-4" aria-hidden /> Refresh</button>
          <Link href="/admin/config" className="btn-primary"><Settings className="h-4 w-4" aria-hidden /> Configure</Link>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {analytics ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total complaints" value={analytics.totals.total} sub={<span className="inline-flex items-center gap-1"><Activity className="h-3.5 w-3.5" /> all time</span>} />
          <Stat label="Resolved" value={analytics.totals.resolved} sub={<span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> closed out</span>} />
          <Stat label="Escalated" value={analytics.totals.escalated} sub={<span className="inline-flex items-center gap-1 text-orange-700"><TimerReset className="h-3.5 w-3.5" /> up the chain</span>} />
          <Stat label="Breach rate" value={`${Math.round(analytics.totals.breachRate * 100)}%`} sub={<span className="inline-flex items-center gap-1 text-red-700"><ShieldAlert className="h-3.5 w-3.5" /> breached + escalated</span>} />
        </div>
      ) : (
        <Card className="p-8"><Spinner /></Card>
      )}

      {triageCount > 0 ? (
        <Link href="/admin/triage" className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 hover:bg-amber-100">
          <span className="inline-flex items-center gap-2"><Inbox className="h-5 w-5 shrink-0" aria-hidden /> {triageCount} complaint{triageCount > 1 ? 's' : ''} awaiting human triage</span>
          <span className="inline-flex items-center gap-1">Resolve <ArrowRight className="h-4 w-4" aria-hidden /></span>
        </Link>
      ) : null}

      <Card className="p-2 sm:p-3">
        {points === null ? <div className="grid h-[70vh] place-items-center"><Spinner /></div> : <CityMap points={points} />}
      </Card>

      {analytics ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-heading text-lg font-semibold text-ink-900">Complaints by category</h2>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.byCategory.map((c) => ({ name: prettyCategory(c.category), count: c.count }))} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip cursor={{ fill: '#F1F5F9' }} />
                  <Bar dataKey="count" fill="#0369A1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-heading text-lg font-semibold text-ink-900">Breach rate by ward</h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-ink-500">
                  <tr><th className="px-3 py-2">Ward</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Breached</th><th className="px-3 py-2">Rate</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analytics.wardStats.map((w) => (
                    <tr key={w.ward}>
                      <td className="px-3 py-2 font-semibold text-ink-900">{w.ward}<span className="block text-xs font-normal text-ink-500">{w.zone}</span></td>
                      <td className="px-3 py-2">{w.total}</td>
                      <td className="px-3 py-2">{w.breached}</td>
                      <td className="px-3 py-2">
                        <span className={`badge ${w.breachRate > 0.3 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                          {Math.round(w.breachRate * 100)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-semibold text-ink-900">Routing-accuracy gate</h2>
                <p className="text-sm text-ink-500">Deterministic routing measured over the labeled set (CI regression gate, threshold 90%).</p>
              </div>
              <button onClick={runAccuracy} className="btn-secondary">Run evaluation</button>
            </div>
            {accuracy ? (
              <div className="mt-4">
                <Alert kind={accuracy.passed ? 'success' : 'error'}>
                  {accuracy.passed ? 'PASS' : 'FAIL'} — {(accuracy.accuracy * 100).toFixed(1)}% ({accuracy.correct}/{accuracy.total} routed correctly)
                </Alert>
              </div>
            ) : null}
            {analytics.totals.avgConfidence !== null ? (
              <p className="mt-3 text-sm text-ink-500">Average classifier confidence: <strong>{(analytics.totals.avgConfidence * 100).toFixed(0)}%</strong></p>
            ) : null}
          </Card>

          <Card className="p-5 lg:col-span-2">
            <h2 className="font-heading text-lg font-semibold text-ink-900">Load by department</h2>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.byDepartment}>
                  <XAxis dataKey="department" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip cursor={{ fill: '#F1F5F9' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {analytics.byDepartment.map((_, i) => <Cell key={i} fill={i % 2 ? '#075985' : '#0369A1'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
