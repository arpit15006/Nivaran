'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, LogOut } from 'lucide-react';
import { useAuth, homeForRole } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { Spinner } from './ui';

interface NavItem {
  href: string;
  label: string;
  roles: Role[];
}

const NAV: NavItem[] = [
  { href: '/citizen', label: 'Report & Track', roles: ['CITIZEN', 'ADMIN'] },
  { href: '/official', label: 'Queue', roles: ['OFFICIAL', 'AUTHORITY', 'ADMIN'] },
  { href: '/admin', label: 'Control Room', roles: ['ADMIN'] },
  { href: '/admin/triage', label: 'Triage', roles: ['ADMIN'] },
  { href: '/admin/config', label: 'Config', roles: ['ADMIN'] },
];

const ROLE_LABEL: Record<Role, string> = {
  CITIZEN: 'Citizen',
  OFFICIAL: 'Dept. Official',
  AUTHORITY: 'Escalation Authority',
  ADMIN: 'City Admin',
};

export function AppShell({ children, requireRoles }: { children: ReactNode; requireRoles?: Role[] }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [clock, setClock] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (requireRoles && !requireRoles.includes(user.role)) {
      router.replace(homeForRole(user.role));
    }
  }, [user, loading, requireRoles, router, pathname]);

  // Live mono clock — a quiet "ops desk" signal that this is a running system.
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-GB'));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Authenticating session" />
      </div>
    );
  }

  const items = NAV.filter((i) => i.roles.includes(user.role));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-900 text-paper">
        <div className="container-page flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <Link href={homeForRole(user.role)} className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded bg-paper font-heading text-sm font-bold text-ink-900">N</span>
              <span className="font-heading text-base font-semibold tracking-tight">NIVARAN</span>
              <span className="hidden items-center gap-1.5 rounded border border-ink-700 px-1.5 py-0.5 sm:inline-flex">
                <span className="live-dot" aria-hidden />
                <span className="font-mono text-2xs uppercase tracking-wider text-ink-300">live</span>
              </span>
            </Link>

            <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
              {items.map((i) => {
                const active = pathname === i.href;
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    aria-current={active ? 'page' : undefined}
                    className={`rounded px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                      active ? 'bg-paper text-ink-900' : 'text-ink-300 hover:bg-ink-800 hover:text-paper'
                    }`}
                  >
                    {i.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="hidden items-center gap-4 md:flex">
            <span className="mono text-xs text-ink-400" aria-hidden>{clock}</span>
            <div className="text-right">
              <p className="text-sm font-semibold leading-tight">{user.name ?? user.email}</p>
              <p className="font-mono text-2xs uppercase tracking-wider text-ink-400">{ROLE_LABEL[user.role]}</p>
            </div>
            <button onClick={() => logout()} className="rounded p-2 text-ink-300 hover:bg-ink-800 hover:text-paper" aria-label="Sign out">
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <button
            className="rounded p-2 text-ink-200 hover:bg-ink-800 lg:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {open ? (
          <nav className="border-t border-ink-800 bg-ink-900 px-4 pb-4 lg:hidden" aria-label="Mobile">
            <div className="flex flex-col gap-0.5 pt-2">
              {items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={() => setOpen(false)}
                  className={`rounded px-3 py-3 text-base font-medium ${
                    pathname === i.href ? 'bg-paper text-ink-900' : 'text-ink-200 hover:bg-ink-800'
                  }`}
                >
                  {i.label}
                </Link>
              ))}
              <div className="mt-2 flex items-center justify-between border-t border-ink-800 pt-3">
                <div>
                  <p className="text-sm font-semibold text-paper">{user.name ?? user.email}</p>
                  <p className="font-mono text-2xs uppercase tracking-wider text-ink-400">{ROLE_LABEL[user.role]}</p>
                </div>
                <button onClick={() => logout()} className="btn-secondary">
                  <LogOut className="h-4 w-4" aria-hidden /> Sign out
                </button>
              </div>
            </div>
          </nav>
        ) : null}
      </header>

      <main id="main" className="container-page py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
