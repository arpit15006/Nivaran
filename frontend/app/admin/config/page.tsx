'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Alert, Card, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { prettyCategory } from '@/lib/format';

const CATEGORIES = ['POTHOLE','STREETLIGHT','GARBAGE','WATER_SUPPLY','SEWAGE','DRAINAGE','ROAD_DAMAGE','TRAFFIC_SIGNAL','STRAY_ANIMALS','ILLEGAL_CONSTRUCTION','NOISE_POLLUTION','TREE_FALL','ELECTRICITY','OTHER'];
const JURISDICTIONS = ['MUNICIPAL','STATE_PWD','NATIONAL_HIGHWAY','PRIVATE','UTILITY'];

interface Dept { id: string; name: string; jurisdiction: string; escalation: { level: number; authority: string; slaHours: number }[] }
interface Rule { id: string; category: string; jurisdiction: string; slaHours: number; version: number; active: boolean; department: { name: string } }

export default function ConfigPage() {
  return (
    <AppShell requireRoles={['ADMIN']}>
      <ConfigView />
    </AppShell>
  );
}

function ConfigView() {
  const [depts, setDepts] = useState<Dept[] | null>(null);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [{ departments }, { rules }] = await Promise.all([
        api<{ departments: Dept[] }>('/departments'),
        api<{ rules: Rule[] }>('/admin/rules'),
      ]);
      setDepts(departments);
      setRules(rules);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load configuration');
    }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-ink-900">Configuration</h1>
        <p className="mt-1 text-sm text-ink-500">
          Departments, routing rules, and escalation chains — changed here without code changes. Rules are versioned;
          editing supersedes the previous active version.
        </p>
      </div>
      {error ? <Alert>{error}</Alert> : null}

      <AddRule depts={depts ?? []} onDone={load} />

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-heading text-lg font-semibold text-ink-900">Routing rules</h2>
        </div>
        {rules === null ? (
          <div className="p-6"><Spinner /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-ink-500">
                <tr><th className="px-4 py-3">Category</th><th className="px-4 py-3">Jurisdiction</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">SLA (h)</th><th className="px-4 py-3">Version</th><th className="px-4 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((r) => (
                  <tr key={r.id} className={r.active ? '' : 'text-ink-500'}>
                    <td className="px-4 py-3 font-semibold text-ink-900">{prettyCategory(r.category)}</td>
                    <td className="px-4 py-3">{r.jurisdiction}</td>
                    <td className="px-4 py-3">{r.department.name}</td>
                    <td className="px-4 py-3">{r.slaHours}</td>
                    <td className="px-4 py-3">v{r.version}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${r.active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-ink-500'}`}>{r.active ? 'Active' : 'Superseded'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-heading text-lg font-semibold text-ink-900">Departments & escalation chains</h2>
        </div>
        {depts === null ? (
          <div className="p-6"><Spinner /></div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {depts.map((d) => (
              <li key={d.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink-900">{d.name}</p>
                  <span className="badge bg-brand-50 text-brand-700">{d.jurisdiction}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-500">
                  {d.escalation.length === 0 ? <span>No escalation steps</span> : d.escalation.map((s) => (
                    <span key={s.level} className="rounded-lg bg-slate-100 px-2 py-1">L{s.level}: {s.authority} ({s.slaHours}h)</span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AddRule({ depts, onDone }: { depts: Dept[]; onDone: () => void }) {
  const [form, setForm] = useState({ category: 'POTHOLE', jurisdiction: 'MUNICIPAL', departmentId: '', slaHours: 48 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/admin/rules', { method: 'POST', body: { ...form, departmentId: form.departmentId || depts[0]?.id, slaHours: Number(form.slaHours) } });
      setMsg('New rule version created and activated.');
      onDone();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Failed to add rule');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="font-heading text-lg font-semibold text-ink-900">Add / supersede a routing rule</h2>
      {msg ? <div className="mt-3"><Alert kind="info">{msg}</Alert></div> : null}
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <div>
          <label className="label" htmlFor="cat">Category</label>
          <select id="cat" className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{prettyCategory(c)}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="jur">Jurisdiction</label>
          <select id="jur" className="input" value={form.jurisdiction} onChange={(e) => setForm((f) => ({ ...f, jurisdiction: e.target.value }))}>
            {JURISDICTIONS.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dep">Department</label>
          <select id="dep" className="input" value={form.departmentId} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sla">SLA (hours)</label>
          <input id="sla" type="number" min={1} max={720} className="input" value={form.slaHours} onChange={(e) => setForm((f) => ({ ...f, slaHours: Number(e.target.value) }))} />
        </div>
        <button type="submit" disabled={busy} className="btn-primary"><Plus className="h-4 w-4" aria-hidden /> {busy ? 'Saving…' : 'Add rule'}</button>
      </form>
    </Card>
  );
}
