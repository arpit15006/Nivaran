import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler, forbidden, notFound } from '../http/errors.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

export const departmentsRouter = Router();
departmentsRouter.use(requireAuth);

// GET /departments/:id/queue — the ONE reusable department view (PRD §6),
// scoped to the logged-in official's department (authorities/admin may read any).
const QuerySchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(25),
});

departmentsRouter.get(
  '/:id/queue',
  requireRole('OFFICIAL', 'AUTHORITY', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const u = req.user!;
    if (u.role === 'OFFICIAL' && u.departmentId !== req.params.id) throw forbidden('Not your department');

    const { status, page, pageSize } = QuerySchema.parse(req.query);
    const where = {
      departmentId: req.params.id,
      ...(status ? { status: status as never } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.complaint.findMany({
        where,
        orderBy: [{ slaDeadline: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { ward: true },
      }),
      prisma.complaint.count({ where }),
    ]);

    const now = Date.now();
    const queue = items.map((c) => {
      const msLeft = c.slaDeadline ? c.slaDeadline.getTime() - now : null;
      return {
        id: c.id,
        rawText: c.rawText,
        category: c.category,
        severity: c.severity,
        status: c.status,
        ward: c.ward?.name ?? null,
        lat: c.lat,
        lng: c.lng,
        slaDeadline: c.slaDeadline,
        escalationLevel: c.escalationLevel,
        msLeft,
        // Near-breach: < 25% of a 24h window remaining, or already overdue.
        nearBreach: msLeft !== null && msLeft < 6 * 3_600_000,
        overdue: msLeft !== null && msLeft < 0,
        createdAt: c.createdAt,
      };
    });

    res.json({ queue, page, pageSize, total });
  }),
);

// GET /departments — list (for admin config + official context).
departmentsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const depts = await prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: { escalation: { orderBy: { level: 'asc' } }, _count: { select: { complaints: true } } },
    });
    res.json({ departments: depts });
  }),
);

departmentsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const dept = await prisma.department.findUnique({
      where: { id: req.params.id },
      include: { escalation: { orderBy: { level: 'asc' } }, rules: true },
    });
    if (!dept) throw notFound();
    res.json({ department: dept });
  }),
);
