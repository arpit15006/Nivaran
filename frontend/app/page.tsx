'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, MapPin, Scale, Timer, FileSearch, ArrowRight } from 'lucide-react';
import { useAuth, homeForRole } from '@/lib/auth';

export default function Landing() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace(homeForRole(user.role));
  }, [user, loading, router]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="container-page flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-900 text-white">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
            <span className="font-heading text-lg font-semibold text-ink-900">Nivaran</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost">Sign in</Link>
            <Link href="/register" className="btn-primary">Get started</Link>
          </div>
        </div>
      </header>

      <section className="container-page py-16 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="badge bg-brand-50 text-brand-700">Civic grievance routing & escalation</span>
          <h1 className="mt-5 font-heading text-4xl font-bold leading-tight text-ink-900 sm:text-5xl">
            Civic complaints that reach the right desk — and don&apos;t get lost.
          </h1>
          <p className="mt-5 text-lg text-ink-500">
            Report a problem in plain words, a photo, or your voice. Nivaran classifies it, routes it to the
            correct department with a deadline, and automatically escalates up the chain if it isn&apos;t resolved
            in time — with a tamper-evident record of every decision.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register" className="btn-primary w-full sm:w-auto">
              Report a problem <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/login" className="btn-secondary w-full sm:w-auto">I&apos;m an official / admin</Link>
          </div>
        </div>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Feature icon={<FileSearch className="h-5 w-5" />} title="LLM perceives">
            Text, photo, and voice are classified into a category and severity — the only job the model does.
          </Feature>
          <Feature icon={<Scale className="h-5 w-5" />} title="Rules decide">
            Jurisdiction and department are resolved by a deterministic, versioned, unit-tested rule engine.
          </Feature>
          <Feature icon={<Timer className="h-5 w-5" />} title="SLAs escalate">
            A durable scheduler auto-escalates breached complaints up the hierarchy — surviving restarts.
          </Feature>
          <Feature icon={<MapPin className="h-5 w-5" />} title="Everyone sees">
            Citizens, officials, and admins get role-scoped dashboards and a live city map.
          </Feature>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="container-page py-8 text-sm text-ink-500">
          The LLM only perceives. Deterministic, auditable engines decide. · Built for accountability & RTI.
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-6">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">{icon}</span>
      <h3 className="mt-4 font-heading text-lg font-semibold text-ink-900">{title}</h3>
      <p className="mt-1.5 text-sm text-ink-500">{children}</p>
    </div>
  );
}
