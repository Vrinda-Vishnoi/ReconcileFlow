import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { generateToken } from '../middleware/auth';
import { createChildLogger } from '../lib/logger';
import { authLimiter } from '../middleware/rateLimit';

const log = createChildLogger('auth-routes');
const router = Router();

const BCRYPT_ROUNDS = 12;

// ── Validation schemas ──

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// ── POST /api/auth/register ──

router.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      });
      return;
    }

    const { email, password, name } = parsed.data;

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({
        error: 'User already exists',
        message: 'An account with this email already exists.',
      });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
      },
    });

    // Generate JWT
    const token = generateToken(user.id, user.email);

    log.info({ userId: user.id, email }, 'User registered');

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token,
    });
  } catch (error) {
    log.error({ err: error }, 'Registration failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/auth/login ──

router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      });
      return;
    }

    const { email, password } = parsed.data;

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect.',
      });
      return;
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect.',
      });
      return;
    }

    // Generate JWT
    const token = generateToken(user.id, user.email);

    log.info({ userId: user.id, email }, 'User logged in');

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token,
    });
  } catch (error) {
    log.error({ err: error }, 'Login failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/auth/demo-login ──

router.post('/demo-login', authLimiter, async (_req: Request, res: Response) => {
  try {
    const email = 'test@reconcileflow.com';
    const password = 'password123';

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          password: await bcrypt.hash(password, BCRYPT_ROUNDS),
          name: 'Demo Recruiter',
        },
      });
    }

    const token = generateToken(user.id, user.email);

    res.json({
      message: 'Demo login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      token,
    });
  } catch (error) {
    log.error({ err: error }, 'Demo login failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
