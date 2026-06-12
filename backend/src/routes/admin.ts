import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler, badRequest, notFound } from '../http/errors.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { appendEvent, verifyAudit } from '../lib/audit.js';
import { runAccuracyEval } from '../services/accuracy.js';
import { resolveJurisdiction } from '../engines/jurisdiction.js';
import { decide } from '../engines/routing.js';
import { scheduleEscalation } from '../engines/escalation.js';
import { JURISDICTIONS, CATEGORIES, type Category } from '../config/domain.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

// GET /admin/map — all complaints as lightweight map points (city-wide view).
adminRouter.get(
  '/map',
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const points = await prisma.complaint.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { createdAt: 'desc' },
      take: 2000,
      select: {
        id: true, lat: true, lng: true, category: true, severity: true, status: true,
        escalationLevel: true, slaDeadline: true, ward: { select: { name: true } },
      },
    });
    res.json({
      points: points.map((p) => ({
        id: p.id, lat: p.lat, lng: p.lng, category: p.category, severity: p.severity,
        status: p.status, escalationLevel: p.escalationLevel, slaDeadline: p.slaDeadline,
        ward: p.ward?.name ?? null,
      })),
    });
  }),
);

// GET /admin/analytics — ops dashboard (PRD §15).
adminRouter.get(
  '/analytics',
  asyncHandler(async (_req, res) => {
    const [byStatus, byCategory, byDept, wards, total, breached, escalated, resolved, confAgg] = await Promise.all([
      prisma.complaint.groupBy({ by: ['status'], _count: true }),
      prisma.complaint.groupBy({ by: ['category'], _count: true }),
      prisma.complaint.groupBy({ by: ['departmentId'], _count: true }),
      prisma.ward.findMany({ select: { id: true, name: true, zone: true } }),
      prisma.complaint.count(),
      prisma.complaint.count({ where: { status: 'BREACHED' } }),
      prisma.complaint.count({ where: { status: 'ESCALATED' } }),
      prisma.complaint.count({ where: { status: 'RESOLVED' } }),
      prisma.complaint.aggregate({ _avg: { classifierConfidence: true } }),
    ]);

    // Breach rate per ward.
    const wardBreach = await prisma.complaint.groupBy({
      by: ['wardId', 'status'],
      _count: true,
    });
    const wardStats = wards.map((w) => {
      const rows = wardBreach.filter((r) => r.wardId === w.id);
      const wtotal = rows.reduce((n, r) => n + r._count, 0);
      const wbreached = rows.filter((r) => r.status === 'BREACHED' || r.status === 'ESCALATED').reduce((n, r) => n + r._count, 0);
      return { ward: w.name, zone: w.zone, total: wtotal, breached: wbreached, breachRate: wtotal ? wbreached / wtotal : 0 };
    });

    const deptNames = await prisma.department.findMany({ select: { id: true, name: true } });
    const deptMap = new Map(deptNames.map((d) => [d.id, d.name]));

    res.json({
      totals: {
        total, breached, escalated, resolved,
        breachRate: total ? (breached + escalated) / total : 0,
        avgConfidence: confAgg._avg.classifierConfidence ?? null,
      },
      byStatus: byStatus.map((r) => ({ status: r.status, count: r._count })),
      byCategory: byCategory.map((r) => ({ category: r.category, count: r._count })),
      byDepartment: byDept.map((r) => ({ department: r.departmentId ? deptMap.get(r.departmentId) ?? 'Unknown' : 'Triage', count: r._count })),
      wardStats,
    });
  }),
);

// POST /admin/routing-accuracy — run the regression harness on demand.
adminRouter.post(
  '/routing-accuracy',
  asyncHandler(async (_req, res) => {
    const result = await runAccuracyEval();
    res.json(result);
  }),
);

// GET /admin/complaints/:id/verify-audit — recompute the hash chain.
adminRouter.get(
  '/complaints/:id/verify-audit',
  asyncHandler(async (req, res) => {
    const result = await verifyAudit(req.params.id);
    res.json(result);
  }),
);

// ---- Triage handling: route complaints the engine parked for a human --------

// GET /admin/triage — complaints awaiting human routing.
adminRouter.get(
  '/triage',
  asyncHandler(async (_req, res) => {
    const items = await prisma.complaint.findMany({
      where: { status: 'TRIAGE' },
      orderBy: { createdAt: 'asc' },
      include: { ward: true, reporter: { select: { name: true } } },
      take: 200,
    });
    res.json({
      triage: items.map((c) => ({
        id: c.id,
        rawText: c.rawText,
        category: c.category,
        severity: c.severity,
        lat: c.lat,
        lng: c.lng,
        ward: c.ward?.name ?? null,
        jurisdiction: c.jurisdiction,
        classifierConfidence: c.classifierConfidence,
        classifierSource: c.classifierSource,
        reporter: c.reporter?.name ?? null,
        hasPhoto: Boolean(c.photoKey),
        createdAt: c.createdAt,
      })),
    });
  }),
);

// POST /admin/complaints/:id/route — assign a triaged complaint.
//  mode "auto"   → re-run the deterministic engine (e.g. after a rule change)
//  mode "manual" → admin assigns a department + SLA explicitly
const RouteSchema = z.object({
  mode: z.enum(['auto', 'manual']).default('auto'),
  departmentId: z.string().optional(),
  slaHours: z.number().int().min(1).max(720).optional(),
});

adminRouter.post(
  '/complaints/:id/route',
  asyncHandler(async (req, res) => {
    const { mode, departmentId, slaHours } = RouteSchema.parse(req.body);
    const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!complaint) throw notFound();
    if (complaint.status === 'RESOLVED' || complaint.status === 'CLOSED') {
      throw badRequest('Complaint is already closed.');
    }

    const now = new Date();
    let resolved: {
      departmentId: string;
      slaDeadline: Date;
      ruleId: string | null;
      ruleVersion: number | null;
      reason: string;
    };

    if (mode === 'manual') {
      if (!departmentId) throw badRequest('departmentId is required for manual routing.');
      const dept = await prisma.department.findUnique({ where: { id: departmentId } });
      if (!dept) throw badRequest('Unknown department.');
      const hours = slaHours ?? 48;
      resolved = {
        departmentId,
        slaDeadline: new Date(now.getTime() + hours * 3_600_000),
        ruleId: null,
        ruleVersion: null,
        reason: `manually assigned to ${dept.name} by admin (SLA ${hours}h)`,
      };
    } else {
      // Auto: re-resolve jurisdiction + rulebook with current configuration.
      const [wards, rules] = await Promise.all([
        prisma.ward.findMany(),
        prisma.routingRule.findMany({ where: { active: true } }),
      ]);
      const jur = resolveJurisdiction(complaint.lat, complaint.lng, complaint.category as Category, wards);
      const decision = decide(rules, complaint.category as Category, jur.jurisdiction, now);
      if (!decision) {
        throw badRequest(
          `No active rule for category=${complaint.category} jurisdiction=${jur.jurisdiction}. Assign a department manually.`,
        );
      }
      resolved = {
        departmentId: decision.departmentId,
        slaDeadline: decision.slaDeadline,
        ruleId: decision.rule.id,
        ruleVersion: decision.rule.version,
        reason: `re-routed via engine: category=${complaint.category} jurisdiction=${jur.jurisdiction} → rule v${decision.rule.version}`,
      };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.complaint.update({
        where: { id: complaint.id },
        data: {
          departmentId: resolved.departmentId,
          appliedRuleId: resolved.ruleId,
          appliedRuleVersion: resolved.ruleVersion,
          slaDeadline: resolved.slaDeadline,
          status: 'ROUTED',
          escalationLevel: 0, // restart the escalation ladder from the dept SLA
        },
        include: { department: true },
      });
      await appendEvent(tx, {
        complaintId: complaint.id,
        kind: 'ROUTED',
        actorId: req.user!.sub,
        detail: {
          mode,
          departmentId: resolved.departmentId,
          ruleId: resolved.ruleId,
          ruleVersion: resolved.ruleVersion,
          slaDeadline: resolved.slaDeadline,
          reason: resolved.reason,
        },
      });
      return next;
    });

    // Durable SLA timer for the freshly-routed complaint.
    await scheduleEscalation(complaint.id, 0, resolved.slaDeadline);

    res.json({
      complaint: {
        id: updated.id,
        status: updated.status,
        department: updated.department?.name ?? null,
        slaDeadline: updated.slaDeadline,
      },
    });
  }),
);

// ---- Configuration CRUD (depts / rules / escalation) — no code changes (G5) ----

const DeptSchema = z.object({
  name: z.string().min(2),
  jurisdiction: z.enum(JURISDICTIONS),
  categories: z.array(z.enum(CATEGORIES)).default([]),
});
adminRouter.post(
  '/departments',
  asyncHandler(async (req, res) => {
    const body = DeptSchema.parse(req.body);
    const dept = await prisma.department.create({ data: body });
    res.status(201).json({ department: dept });
  }),
);
adminRouter.patch(
  '/departments/:id',
  asyncHandler(async (req, res) => {
    const body = DeptSchema.partial().parse(req.body);
    const dept = await prisma.department.update({ where: { id: req.params.id }, data: body }).catch(() => null);
    if (!dept) throw notFound();
    res.json({ department: dept });
  }),
);

// Rules are versioned: editing creates a new active version, supersedes the old.
const RuleSchema = z.object({
  category: z.enum(CATEGORIES),
  jurisdiction: z.enum(JURISDICTIONS),
  departmentId: z.string(),
  slaHours: z.number().int().min(1).max(720),
});
adminRouter.post(
  '/rules',
  asyncHandler(async (req, res) => {
    const body = RuleSchema.parse(req.body);
    const latest = await prisma.routingRule.findFirst({
      where: { category: body.category, jurisdiction: body.jurisdiction },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;
    const rule = await prisma.$transaction(async (tx) => {
      if (latest) await tx.routingRule.update({ where: { id: latest.id }, data: { active: false } });
      return tx.routingRule.create({ data: { ...body, version, active: true } });
    });
    res.status(201).json({ rule });
  }),
);
adminRouter.get(
  '/rules',
  asyncHandler(async (_req, res) => {
    const rules = await prisma.routingRule.findMany({
      orderBy: [{ category: 'asc' }, { jurisdiction: 'asc' }, { version: 'desc' }],
      include: { department: { select: { name: true } } },
    });
    res.json({ rules });
  }),
);

const EscalationSchema = z.object({
  departmentId: z.string(),
  level: z.number().int().min(1),
  authority: z.string().min(2),
  contact: z.string().optional(),
  slaHours: z.number().int().min(1).max(720).default(24),
});
adminRouter.post(
  '/escalation',
  asyncHandler(async (req, res) => {
    const body = EscalationSchema.parse(req.body);
    const step = await prisma.escalationStep.upsert({
      where: { departmentId_level: { departmentId: body.departmentId, level: body.level } },
      create: body,
      update: { authority: body.authority, contact: body.contact, slaHours: body.slaHours },
    });
    res.status(201).json({ step });
  }),
);
