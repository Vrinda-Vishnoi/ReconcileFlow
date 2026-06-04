import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { createChildLogger } from '../lib/logger';
import { createPaymentIntent, confirmPaymentIntent } from '../services/stripe.service';
import { logAuditEntry } from '../services/audit.service';
import crypto from 'crypto';

const log = createChildLogger('order-routes');
const router = Router();

// All order routes require authentication
router.use(authenticate);

const createOrderSchema = z.object({
  amountMinor: z.number().int().positive('Amount must be a positive integer (in paise)'),
  currency: z.string().default('INR'),
  customerEmail: z.string().email().optional(),
  description: z.string().optional(),
});

// ── GET /api/orders ──

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as string;

    const where: any = {};
    if (status) where.status = status;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: { gatewayTxns: true, matches: true },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    // Convert BigInt to string for JSON serialization
    const serialized = orders.map((o) => ({
      ...o,
      amountMinor: o.amountMinor.toString(),
    }));

    res.json({
      data: serialized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to list orders');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/orders ──

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      });
      return;
    }

    const { amountMinor, currency, customerEmail, description } = parsed.data;
    const externalRef = `ORD-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

    // Create order in DB
    const order = await prisma.order.create({
      data: {
        externalRef,
        amountMinor: BigInt(amountMinor),
        currency,
        customerEmail,
        description,
        status: 'PENDING',
      },
    });

    // Create Stripe PaymentIntent
    let paymentIntent;
    try {
      paymentIntent = await createPaymentIntent(amountMinor, currency, {
        orderId: order.id,
        externalRef,
      });

      // Auto-confirm with test card for simulation
      await confirmPaymentIntent(paymentIntent.id);

      // Update order status
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'PAID' },
      });
    } catch (stripeError) {
      log.warn({ err: stripeError, orderId: order.id }, 'Stripe charge failed — order remains PENDING');
      // Don't fail the order creation — Stripe might be unavailable
    }

    await logAuditEntry({
      actor: req.user!.userId,
      action: 'ORDER_CREATED',
      entityType: 'Order',
      entityId: order.id,
      after: {
        externalRef,
        amountMinor: amountMinor.toString(),
        currency,
        paymentIntentId: paymentIntent?.id,
      },
    });

    res.status(201).json({
      ...order,
      amountMinor: order.amountMinor.toString(),
      paymentIntentId: paymentIntent?.id,
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to create order');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/orders/:id ──

router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        gatewayTxns: true,
        matches: {
          include: { run: true },
        },
      },
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    res.json({
      ...order,
      amountMinor: order.amountMinor.toString(),
      gatewayTxns: order.gatewayTxns.map((t) => ({
        ...t,
        amountMinor: t.amountMinor.toString(),
        feeMinor: t.feeMinor.toString(),
      })),
      matches: order.matches.map((m) => ({
        ...m,
        amountDeltaMinor: m.amountDeltaMinor?.toString(),
      })),
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to get order');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
