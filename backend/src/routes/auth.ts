import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler, conflict, unauthorized } from '../http/errors.js';
import { authLimiter } from '../http/rateLimit.js';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  newRefreshToken,
  hashToken,
  ttlToMs,
} from '../auth/tokens.js';
import { requireAuth } from '../auth/middleware.js';
import { env, isProd } from '../env.js';

export const authRouter = Router();
authRouter.use(authLimiter);

const RegisterSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(8).max(15).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(120).optional(),
}).refine((d) => d.email || d.phone, { message: 'email or phone is required' });

const LoginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(1),
}).refine((d) => d.email || d.phone, { message: 'email or phone is required' });

const refreshCookieOpts = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/api/v1/auth',
  maxAge: ttlToMs(env.REFRESH_TOKEN_TTL),
};

async function issueSession(user: { id: string; role: string; departmentId: string | null }) {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role as never,
    departmentId: user.departmentId,
  });
  const { token, tokenHash } = newRefreshToken();
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + ttlToMs(env.REFRESH_TOKEN_TTL)) },
  });
  return { accessToken, refreshToken: token };
}

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = RegisterSchema.parse(req.body);
    const existing = await prisma.user.findFirst({
      where: { OR: [body.email ? { email: body.email } : {}, body.phone ? { phone: body.phone } : {}].filter((o) => Object.keys(o).length) },
    });
    if (existing) throw conflict('An account with that email or phone already exists');

    const user = await prisma.user.create({
      data: {
        email: body.email,
        phone: body.phone,
        name: body.name,
        passwordHash: await hashPassword(body.password),
        role: 'CITIZEN',
      },
    });

    const { accessToken, refreshToken } = await issueSession(user);
    res.cookie('refresh_token', refreshToken, refreshCookieOpts);
    res.status(201).json({ accessToken, user: publicUser(user) });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = LoginSchema.parse(req.body);
    const user = await prisma.user.findFirst({
      where: body.email ? { email: body.email } : { phone: body.phone },
    });
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, body.password))) {
      throw unauthorized('Invalid credentials');
    }
    const { accessToken, refreshToken } = await issueSession(user);
    res.cookie('refresh_token', refreshToken, refreshCookieOpts);
    res.json({ accessToken, user: publicUser(user) });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = (req as { cookies?: Record<string, string> }).cookies?.refresh_token;
    if (!token) throw unauthorized('No refresh token');
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw unauthorized('Refresh token invalid or expired');
    }
    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) throw unauthorized();

    // Rotate: revoke the old token, issue a new pair.
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const { accessToken, refreshToken } = await issueSession(user);
    res.cookie('refresh_token', refreshToken, refreshCookieOpts);
    res.json({ accessToken, user: publicUser(user) });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = (req as { cookies?: Record<string, string> }).cookies?.refresh_token;
    if (token) {
      await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(token) }, data: { revokedAt: new Date() } });
    }
    res.clearCookie('refresh_token', { ...refreshCookieOpts, maxAge: undefined });
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, include: { department: true } });
    if (!user) throw unauthorized();
    res.json({ user: { ...publicUser(user), department: user.department?.name ?? null } });
  }),
);

function publicUser(u: { id: string; email: string | null; phone: string | null; name: string | null; role: string; departmentId: string | null }) {
  return { id: u.id, email: u.email, phone: u.phone, name: u.name, role: u.role, departmentId: u.departmentId };
}
