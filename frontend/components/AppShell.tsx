'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, LogOut, ShieldCheck } from 'lucide-react';
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
  { href: '/official', label: 'Department Queue', roles: ['OFFICIAL', 'AUTHORITY', 'ADMIN'] },
  { href: '/admin', label: 'City Dashboard', roles: ['ADMIN'] },
  { href: '/admin/triage', label: 'Triage', roles: ['ADMIN'] },
  { href: '/admin/config', label: 'Configuration', roles: ['ADMIN'] },
];

export function AppShell({ children, requireRoles }: { children: ReactNode; requireRoles?: Role[] }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Checking your session…" />
      </div>
    );
  }

  const items = NAV.filter((i) => i.roles.includes(user.role));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <Link href={homeForRole(user.role)} className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-900 text-white">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
            <span className="font-heading text-lg font-semibold text-ink-900">Nivaran</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-200 ${
                  pathname === i.href ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-slate-100'
                }`}
              >
                {i.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <div className="text-right">
              <p className="text-sm font-semibold text-ink-900">{user.name ?? user.email}</p>
              <p className="text-xs text-ink-500">{roleLabel(user.role)}</p>
            </div>
            <button onClick={() => logout()} className="btn-ghost px-3" aria-label="Sign out">
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <button
            className="btn-ghost px-2 md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {open ? (
          <nav className="border-t border-slate-200 bg-white px-4 pb-4 md:hidden" aria-label="Mobile">
            <div className="flex flex-col gap-1 pt-2">
              {items.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-lg px-3 py-3 text-base font-semibold ${
                    pathname === i.href ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-slate-100'
                  }`}
                >
                  {i.label}
                </Link>
              ))}
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3">
                <div>
                  <p className="text-sm font-semibold text-ink-900">{user.name ?? user.email}</p>
                  <p className="text-xs text-ink-500">{roleLabel(user.role)}</p>
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

function roleLabel(role: Role): string {
  return { CITIZEN: 'Citizen', OFFICIAL: 'Department Official', AUTHORITY: 'Escalation Authority', ADMIN: 'City Admin' }[role];
}
