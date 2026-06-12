'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Scale, Timer, FileSearch, ArrowRight } from 'lucide-react';
import { useAuth, homeForRole } from '@/lib/auth';

export default function Landing() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace(homeForRole(user.role));
  }, [user, loading, router]);

  return (
    <div className="min-h-screen">
      {/* Dark ops band — the control-room signature, top of the funnel. */}
      <div className="bg-ink-900 text-paper">
        <header className="container-page flex h-14 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded bg-paper font-heading text-sm font-bold text-ink-900">N</span>
            <span className="font-heading text-base font-semibold tracking-tight">NIVARAN</span>
            <span className="hidden items-center gap-1.5 rounded border border-ink-700 px-1.5 py-0.5 sm:inline-flex">
              <span className="live-dot" aria-hidden />
              <span className="font-mono text-2xs uppercase tracking-wider text-ink-300">live</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded px-3 py-2 text-sm font-medium text-ink-200 hover:bg-ink-800 hover:text-paper">Sign in</Link>
            <Link href="/register" className="rounded-md bg-paper px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-paper-sunken">Get started</Link>
          </div>
        </header>

        <section className="container-page py-16 sm:py-24">
          <div className="max-w-3xl">
            <p className="eyebrow text-ink-400">Civic grievance routing &amp; escalation · operations desk</p>
            <h1 className="mt-4 font-heading text-4xl font-semibold leading-[1.05] text-paper sm:text-5xl">
              Civic complaints that reach the right desk — and don&apos;t get lost.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-ink-300">
              Report a problem in plain words, a photo, or your voice. An LLM classifies it; a deterministic,
              auditable engine routes it to the correct department with a deadline; and an autonomous agent
              escalates it up the chain the moment it breaches — every decision recorded.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="btn bg-signal text-white hover:bg-signal-700 sm:w-auto">
                Report a problem <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/login" className="btn border border-ink-700 text-paper hover:bg-ink-800 sm:w-auto">
                I&apos;m an official / admin
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* The pipeline — perceive → decide → escalate → observe. */}
      <section className="container-page py-14 sm:py-20">
        <p className="eyebrow">The pipeline</p>
        <h2 className="mt-1 font-heading text-2xl font-semibold text-ink-900">Perception is AI. Decisions are deterministic.</h2>
        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          <Step n="01" icon={<FileSearch className="h-5 w-5" />} title="LLM perceives" accent="#33415B">
            Text, photo, and voice are classified into a category and severity — the only job the model does.
          </Step>
          <Step n="02" icon={<Scale className="h-5 w-5" />} title="Rules decide" accent="#1D70B8">
            Jurisdiction and department are resolved by a versioned, unit-tested rule engine. Reproducible and auditable.
          </Step>
          <Step n="03" icon={<Timer className="h-5 w-5" />} title="Agent escalates" accent="#EA580C">
            On a breach, an autonomous agent reasons over severity, safety and history — and moves it up the chain.
          </Step>
          <Step n="04" icon={<MapPin className="h-5 w-5" />} title="City observes" accent="#15803D">
            A live tactical map and role dashboards give citizens, officials and admins one shared picture.
          </Step>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="container-page py-8">
          <p className="font-mono text-xs text-ink-500">
            The LLM only perceives. Deterministic, auditable engines decide. Built for accountability &amp; RTI.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, icon, title, accent, children }: { n: string; icon: React.ReactNode; title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="relative bg-paper-card p-6">
      <span className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: accent }} aria-hidden />
      <div className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-md" style={{ backgroundColor: `${accent}14`, color: accent }}>{icon}</span>
        <span className="font-mono text-sm font-semibold text-ink-300">{n}</span>
      </div>
      <h3 className="mt-4 font-heading text-lg font-semibold text-ink-900">{title}</h3>
      <p className="mt-1.5 text-sm text-ink-500">{children}</p>
    </div>
  );
}
