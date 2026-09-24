import bcrypt from 'bcryptjs';
import { Router, type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { PrismaClient, Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  companyId: string;
}

const TOKEN_TTL = '8h';

export function signToken(user: AuthUser, secret: string): string {
  return jwt.sign({ email: user.email, role: user.role, companyId: user.companyId }, secret, {
    subject: user.id,
    expiresIn: TOKEN_TTL,
    algorithm: 'HS256',
  });
}

export function verifyToken(token: string, secret: string): AuthUser {
  const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (typeof payload === 'string' || !payload.sub) throw new Error('malformed token');
  return {
    id: payload.sub,
    email: String(payload.email),
    role: payload.role as Role,
    companyId: String(payload.companyId),
  };
}

export function requireAuth(secret: string): RequestHandler {
  return (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({ error: 'missing bearer token' });
      return;
    }
    try {
      res.locals.user = verifyToken(token, secret);
      next();
    } catch {
      res.status(401).json({ error: 'invalid token' });
    }
  };
}

export function authRouter(prisma: PrismaClient, secret: string): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { email, password } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: 'invalid credentials' });
      return;
    }
    const authUser: AuthUser = { id: user.id, email: user.email, role: user.role, companyId: user.companyId };
    res.json({ token: signToken(authUser, secret), user: authUser });
  });

  router.get('/me', requireAuth(secret), (_req, res) => {
    res.json({ user: res.locals.user as AuthUser });
  });

  return router;
}

/** Creates the first admin on an empty database so the dashboard is usable out of the box. */
export async function ensureAdmin(prisma: PrismaClient, email?: string, password?: string): Promise<void> {
  if (!email || !password || (await prisma.user.count()) > 0) return;
  const company = await prisma.company.upsert({
    where: { name: 'cnotv' },
    update: {},
    create: { name: 'cnotv' },
  });
  await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12),
      role: 'admin',
      companyId: company.id,
    },
  });
}
