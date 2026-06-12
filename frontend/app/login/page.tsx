'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, LogIn } from 'lucide-react';
import { useAuth, homeForRole } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Alert } from '@/components/ui';

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login({ email, password });
      const next = params.get('next');
      router.replace(next && next.startsWith('/') ? next : homeForRole(user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  const [demoBusy, setDemoBusy] = useState<string | null>(null);

  // One-click demo sign-in: authenticate immediately with the seeded account.
  async function demoLogin(role: string) {
    setDemoBusy(role);
    setError(null);
    setEmail(`${role}@nivaran.gov`);
    setPassword('Password123!');
    try {
      const user = await login({ email: `${role}@nivaran.gov`, password: 'Password123!' });
      const next = params.get('next');
      router.replace(next && next.startsWith('/') ? next : homeForRole(user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Demo sign in failed');
      setDemoBusy(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ink-900 text-white">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <span className="font-heading text-xl font-semibold text-ink-900">Nivaran</span>
        </Link>

        <div className="card p-6 sm:p-8">
          <h1 className="font-heading text-2xl font-semibold text-ink-900">Sign in</h1>
          <p className="mt-1 text-sm text-ink-500">Access your dashboard.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {error ? <Alert>{error}</Alert> : null}
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input id="email" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.gov" />
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <input id="password" type="password" autoComplete="current-password" required value={password}
                onChange={(e) => setPassword(e.target.value)} className="input" placeholder="••••••••" />
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-ink-500">
            New citizen? <Link href="/register" className="font-semibold text-brand-700 hover:underline">Create an account</Link>
          </p>
        </div>

        <div className="card mt-4 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">One-click demo sign in</p>
          <p className="mt-0.5 text-xs text-ink-500">Instantly enter as any role (password is pre-filled).</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { role: 'citizen', label: 'Citizen' },
              { role: 'official', label: 'Official' },
              { role: 'authority', label: 'Authority' },
              { role: 'admin', label: 'City Admin' },
            ].map((r) => (
              <button
                key={r.role}
                onClick={() => demoLogin(r.role)}
                disabled={demoBusy !== null || busy}
                className="btn-secondary justify-between text-xs"
              >
                {demoBusy === r.role ? 'Signing in…' : r.label}
                {demoBusy === r.role ? null : <LogIn className="h-3.5 w-3.5" aria-hidden />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
