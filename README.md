# Nivaran — Civic Grievance Routing & Escalation Platform

> Citizens report civic problems (text/photo/voice); an **LLM classifies** them; a **deterministic, auditable engine** resolves jurisdiction and routes to the correct department with an SLA; a **durable BullMQ worker auto-escalates** up the hierarchy on breach. Role-based dashboards and a live city map give everyone visibility — with auth/RBAC, a tamper-evident audit trail, and a routing-accuracy regression gate.

**The LLM only perceives. Deterministic, auditable engines decide.**

```
frontend (Next.js · Vercel)  ──HTTPS/JWT──▶  backend (Express · Render)
  role UIs · react-leaflet map                REST /api/v1 (zod) · Auth+RBAC
  PWA-ready · a11y · i18n-ready                Classifier (Groq) · Routing engine
                                              Escalation worker (BullMQ+Redis)
                                                     │ Prisma
                                  ┌──────────────────┼─────────────────┐
                             PostgreSQL            Redis            Cloudinary
                          (Prisma Postgres)   (jobs/ratelimit)   (signed media)
```

---

## Stack

| Concern | Choice |
|---|---|
| Frontend | Next.js 14 (App Router, TS), Tailwind, react-leaflet, recharts |
| Backend | Express + TypeScript, zod-validated `/api/v1` |
| ORM / DB | Prisma + PostgreSQL |
| Jobs | BullMQ + Redis (durable SLA escalation timers) |
| Auth | JWT access + httpOnly refresh cookie, argon2, RBAC |
| Classifier | **Groq** (LLM) + deterministic keyword fallback |
| Media | **Cloudinary** — authenticated (private) uploads, signed delivery URLs |
| Logging | pino (structured) | 
| Tests | Vitest (engines) + routing-accuracy CI gate |

Design system: **"Accessible & Ethical"** (WCAG-AA, high-contrast navy/blue, Lexend + Source Sans 3) — fully responsive for laptop and phone.

---

## Quick start

### 1. Prerequisites
- Node 20+
- A **PostgreSQL** database (the `.env` ships with a Prisma Postgres URL already filled in)
- **Redis** — either `docker compose up -d` (uses [docker-compose.yml](docker-compose.yml)) or a local `redis-server`
- A **Groq API key** and **Cloudinary** account (both already in `.env`)

### 2. Configure
Everything lives in the single root [`.env`](.env). It already contains your Groq key, Prisma Postgres URL, and Cloudinary credentials. The only thing to change for production is the JWT secrets.

### 3. Install, migrate, seed
```bash
npm install
# start Redis (pick one):
docker compose up -d          # OR: redis-server --daemonize yes
npm run db:migrate            # apply Prisma migrations
npm run db:seed               # departments, rules, escalation chains, wards, demo users
```

### 4. Run (both apps)
```bash
npm run dev                   # backend on :4000, frontend on :3000 (or :3001 if taken)
```
- Frontend: http://localhost:3000
- Backend health: http://localhost:4000/healthz · readiness: `/readyz`

In production run the escalation worker as its own process:
```bash
npm run dev:worker            # dev
npm run start:worker          # prod (after npm run build)
```

### Demo logins (password: `Password123!`)
| Role | Email | Sees |
|---|---|---|
| Citizen | `citizen@nivaran.gov` | Report + track own complaints |
| Official | `official@nivaran.gov` | Roads dept queue (scoped) |
| Authority | `authority@nivaran.gov` | Escalated items |
| Admin | `admin@nivaran.gov` | City map, analytics, configuration |

---

## The three engines

1. **Classifier** ([backend/src/services/classifier.ts](backend/src/services/classifier.ts)) — Groq with timeout/retry/backoff; deterministic keyword fallback; confidence score. Low confidence → human-triage queue. *Only* outputs category + severity.
2. **Routing** ([backend/src/engines/](backend/src/engines/)) — point-in-polygon over ward GeoJSON (`turf.js`) + authority rules → `JurisdictionType`; versioned `RoutingRule` → department + SLA. Pure, deterministic, unit-tested, accuracy-gated.
3. **Escalation** ([backend/src/engines/escalation.ts](backend/src/engines/escalation.ts)) — BullMQ delayed job at `slaDeadline`; on breach marks + escalates to the next `EscalationStep` and schedules the next timer. **Idempotent** (deterministic jobId + complaint-state guard) and **durable** (survives restarts), with a **reconciliation sweep** every 2 min.

## Audit trail
Every decision writes a hash-chained `StatusEvent` (`hash = SHA-256(prevHash + kind + actor + canonical(detail) + ts)`). `verifyAudit()` recomputes the chain — exposed at `GET /api/v1/admin/complaints/:id/verify-audit`. Hashing is canonical (sorted keys) so it survives Postgres `jsonb` reordering.

## Media (Cloudinary, Option A)
Browser uploads directly to Cloudinary as an **authenticated** (private) asset using a backend-signed signature; the DB stores only the `public_id`; the backend mints **signed delivery URLs** for authorized viewers. See [backend/src/services/storage.ts](backend/src/services/storage.ts).

---

## Testing & CI
```bash
npm run test          # 23 engine/audit/classifier unit tests (no infra needed)
npm run typecheck     # backend + frontend
```
[CI](.github/workflows/ci.yml) runs lint/typecheck/tests + applies migrations + **fails the build if routing accuracy < 90%** (`backend/scripts/check-accuracy.ts`).

## Project layout
```
backend/   Express API, Prisma schema+seed, the three engines, tests
frontend/  Next.js App Router — landing, auth, citizen/official/admin, map
.env       single source of truth for secrets
```

## Security & privacy (DPDP-aligned)
zod validation everywhere · helmet + strict CORS · Redis-backed rate limiting on auth/intake · argon2 hashing · revocable refresh tokens · RBAC enforced server-side on every endpoint · official reads of citizen data are audited (`VIEWED`) · media is private with signed access · `MEDIA_RETENTION_DAYS` retention policy.
