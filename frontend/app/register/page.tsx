'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Alert } from '@/components/ui';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(form);
      router.replace('/citizen');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded bg-ink-900 font-heading text-base font-bold text-paper">N</span>
          <span className="font-heading text-xl font-semibold tracking-tight text-ink-900">NIVARAN</span>
        </Link>

        <div className="card p-6 sm:p-8">
          <h1 className="font-heading text-2xl font-semibold text-ink-900">Create your account</h1>
          <p className="mt-1 text-sm text-ink-500">Citizens can register here to report and track complaints.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {error ? <Alert>{error}</Alert> : null}
            <div>
              <label htmlFor="name" className="label">Full name</label>
              <input id="name" required value={form.name} onChange={(e) => set('name', e.target.value)}
                className="input" placeholder="Asha Sharma" />
            </div>
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input id="email" type="email" autoComplete="email" required value={form.email}
                onChange={(e) => set('email', e.target.value)} className="input" placeholder="you@example.com" />
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <input id="password" type="password" autoComplete="new-password" required minLength={8} value={form.password}
                onChange={(e) => set('password', e.target.value)} className="input" placeholder="At least 8 characters" />
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-ink-500">
            Already have an account? <Link href="/login" className="font-semibold text-signal-700 hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
