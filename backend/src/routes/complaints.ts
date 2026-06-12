import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../http/errors.js';
import { complaintLimiter } from '../http/rateLimit.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { intakeComplaint } from '../services/pipeline.js';
import { appendEvent } from '../lib/audit.js';
import { isAllowedContentType, signUpload, signedDeliveryUrl } from '../services/storage.js';
import { CATEGORIES } from '../config/domain.js';
import type { Status } from '@prisma/client';

export const complaintsRouter = Router();
complaintsRouter.use(requireAuth);

const CreateSchema = z.object({
  rawText: z.string().min(5, 'Please describe the issue').max(4000),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  photoKey: z.string().max(300).optional(),
  voiceKey: z.string().max(300).optional(),
  imageUrl: z.string().url().optional(),
});

// POST /complaints — citizen (or admin on behalf). Idempotency-Key supported.
complaintsRouter.post(
  '/',
  complaintLimiter,
  requireRole('CITIZEN', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const body = CreateSchema.parse(req.body);
    // A photo of the problem is mandatory for citizen reports (evidence for
    // routing & accountability). Admins filing on behalf are exempt.
    if (req.user!.role === 'CITIZEN' && !body.photoKey) {
      throw badRequest('A photo of the problem is required.');
    }
    const idemKey = req.header('Idempotency-Key');

    if (idemKey) {
      const existing = await prisma.idempotencyKey.findUnique({ where: { key: idemKey } });
      if (existing) return res.status(200).json(existing.response);
    }

    const complaint = await intakeComplaint({ reporterId: req.user!.sub, ...body });
    const payload = { complaint: shapeComplaint(complaint) };

    if (idemKey) {
      await prisma.idempotencyKey.create({ data: { key: idemKey, userId: req.user!.sub, response: payload } });
    }
    res.status(201).json(payload);
  }),
);

// POST /complaints/upload-url — signed Cloudinary upload payload (PRD §11).
// Browser uploads the file directly to Cloudinary as an authenticated asset and
// sends us back the returned public_id as photoKey/voiceKey.
const UploadSchema = z.object({
  kind: z.enum(['photo', 'voice']),
  contentType: z.string().min(3),
});
complaintsRouter.post(
  '/upload-url',
  requireRole('CITIZEN', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const { kind, contentType } = UploadSchema.parse(req.body);
    if (!isAllowedContentType(contentType)) throw badRequest('Unsupported file type');
    const signed = signUpload(kind);
    if (!signed) {
      // Cloudinary not configured — tell the client to submit without media.
      return res.status(200).json({ storage: 'unconfigured' });
    }
    res.json({ ...signed, storage: 'cloudinary' });
  }),
);

// GET /complaints/mine — citizen's own complaints.
complaintsRouter.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const items = await prisma.complaint.findMany({
      where: { reporterId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { department: true, ward: true },
    });
    res.json({ complaints: items.map(shapeComplaint) });
  }),
);

// GET /complaints/:id — RBAC-scoped. Official reads of citizen data are audited.
complaintsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const complaint = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: { department: true, ward: true, reporter: { select: { id: true, name: true } } },
    });
    if (!complaint) throw notFound('Complaint not found');

    const u = req.user!;
    const isOwner = complaint.reporterId === u.sub;
    const isDeptOfficial = u.role === 'OFFICIAL' && complaint.departmentId === u.departmentId;
    const isPrivileged = u.role === 'AUTHORITY' || u.role === 'ADMIN';
    if (!isOwner && !isDeptOfficial && !isPrivileged) throw forbidden();

    // Access audit (PRD §14): record every read of citizen data by a non-owner.
    if (!isOwner) {
      await appendEvent(prisma, {
        complaintId: complaint.id,
        kind: 'VIEWED',
        actorId: u.sub,
        detail: { role: u.role },
      });
    }

    const photoUrl = complaint.photoKey ? signedDeliveryUrl(complaint.photoKey, 'photo') : null;
    const voiceUrl = complaint.voiceKey ? signedDeliveryUrl(complaint.voiceKey, 'voice') : null;
    res.json({ complaint: { ...shapeComplaint(complaint), photoUrl, voiceUrl } });
  }),
);

// GET /complaints/:id/events — the audit trail.
complaintsRouter.get(
  '/:id/events',
  asyncHandler(async (req, res) => {
    const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!complaint) throw notFound();
    const u = req.user!;
    const allowed =
      complaint.reporterId === u.sub ||
      (u.role === 'OFFICIAL' && complaint.departmentId === u.departmentId) ||
      u.role === 'AUTHORITY' ||
      u.role === 'ADMIN';
    if (!allowed) throw forbidden();

    const events = await prisma.statusEvent.findMany({
      where: { complaintId: complaint.id },
      orderBy: { seq: 'asc' },
    });
    res.json({ events });
  }),
);

// PATCH /complaints/:id/status — officials/authorities update or resolve.
const StatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'RESOLVED', 'CLOSED', 'TRIAGE', 'ROUTED']),
  note: z.string().max(1000).optional(),
});
complaintsRouter.patch(
  '/:id/status',
  requireRole('OFFICIAL', 'AUTHORITY', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const { status, note } = StatusSchema.parse(req.body);
    const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!complaint) throw notFound();

    const u = req.user!;
    if (u.role === 'OFFICIAL' && complaint.departmentId !== u.departmentId) throw forbidden('Not your department');

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.complaint.update({
        where: { id: complaint.id },
        data: {
          status: status as Status,
          resolvedAt: status === 'RESOLVED' ? new Date() : complaint.resolvedAt,
        },
        include: { department: true, ward: true },
      });
      await appendEvent(tx, {
        complaintId: complaint.id,
        kind: status === 'RESOLVED' ? 'RESOLVED' : 'STATUS_CHANGE',
        actorId: u.sub,
        detail: { from: complaint.status, to: status, note: note ?? null },
      });
      return next;
    });

    res.json({ complaint: shapeComplaint(updated) });
  }),
);

type ComplaintWithRelations = Awaited<ReturnType<typeof intakeComplaint>> & {
  department?: { name: string } | null;
  ward?: { name: string; zone: string } | null;
  reporter?: { id: string; name: string | null } | null;
};

function shapeComplaint(c: ComplaintWithRelations) {
  return {
    id: c.id,
    rawText: c.rawText,
    category: c.category,
    severity: c.severity,
    status: c.status,
    lat: c.lat,
    lng: c.lng,
    ward: c.ward?.name ?? null,
    zone: c.ward?.zone ?? null,
    jurisdiction: c.jurisdiction,
    department: c.department?.name ?? null,
    departmentId: c.departmentId,
    slaDeadline: c.slaDeadline,
    escalationLevel: c.escalationLevel,
    classifierConfidence: c.classifierConfidence,
    classifierSource: c.classifierSource,
    hasPhoto: Boolean(c.photoKey),
    hasVoice: Boolean(c.voiceKey),
    reporter: c.reporter ? { id: c.reporter.id, name: c.reporter.name } : undefined,
    createdAt: c.createdAt,
  };
}

// Exported so the admin map can reuse the canonical category list.
export const COMPLAINT_CATEGORIES = CATEGORIES;
