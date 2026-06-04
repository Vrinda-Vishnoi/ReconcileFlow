import { Router, Request, Response } from 'express';
import express from 'express';
import { constructWebhookEvent, getEventAction } from '../services/stripe.service';
import { checkIdempotency, removeIdempotencyKey } from '../services/idempotency.service';
import { enqueueJob } from '../queue/queue';
import { createChildLogger } from '../lib/logger';
import { webhooksReceivedTotal } from './health.routes';

const log = createChildLogger('webhook-routes');
const router = Router();

// Stripe requires the raw body for signature verification
// So we use express.raw() specifically for this route
router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const signature = req.headers['stripe-signature'];
    
    if (!signature) {
      log.warn('Webhook request missing signature');
      res.status(400).send('Missing signature');
      return;
    }

    let event;

    try {
      // 1. Verify signature
      event = constructWebhookEvent(req.body, signature as string);
    } catch (err: any) {
      log.error({ err: err.message }, 'Webhook signature verification failed');
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    const eventId = event.id;
    const eventType = event.type;
    
    // Extract amount and other metadata based on event type
    let amountMinor = 0;
    let orderId = null;
    let gatewayRef = null;
    let feeMinor = 0;
    
    // We only care about specific payment events for reconciliation
    const relevantEvents = ['payment_intent.succeeded', 'charge.succeeded', 'charge.refunded', 'charge.dispute.created'];
    
    if (!relevantEvents.includes(eventType)) {
      // Return 200 OK for events we don't handle so Stripe stops retrying
      res.status(200).send({ received: true });
      return;
    }

    try {
      const dataObject = event.data.object as any;
      amountMinor = dataObject.amount || 0;
      orderId = dataObject.metadata?.orderId || null;
      gatewayRef = dataObject.id; // Usually the payment intent ID or charge ID
      
      // If it's a charge, we might have balance transaction details for fees
      // For simplicity in this demo, we'll estimate a 2.5% fee if not explicitly provided
      if (dataObject.balance_transaction && typeof dataObject.balance_transaction === 'object') {
        feeMinor = dataObject.balance_transaction.fee || 0;
      } else if (amountMinor > 0) {
        // Mock 2.5% fee for demo purposes
        feeMinor = Math.floor(amountMinor * 0.025);
      }
      
      // 2. Pass idempotency check (Redis fast path)
      const isDuplicate = await checkIdempotency(eventId, amountMinor);
      
      if (isDuplicate) {
        webhooksReceivedTotal.inc({ type: eventType, status: 'duplicate' });
        // Return 200 OK immediately
        res.status(200).send({ received: true, duplicate: true });
        return;
      }

      webhooksReceivedTotal.inc({ type: eventType, status: 'processed' });
      
      // 3. Enqueue job to reconcile-jobs queue
      await enqueueJob({
        type: 'webhook',
        payload: {
          eventId,
          eventType,
          action: getEventAction(eventType),
          amount: amountMinor,
          fee: feeMinor,
          orderId,
          gatewayRef,
          currency: dataObject.currency || 'inr',
          rawEvent: event
        }
      });
      
      // 4. Respond 200-OK
      res.status(200).send({ received: true });
      
    } catch (err: any) {
      log.error({ err, eventId }, 'Error processing webhook');
      
      // If processing failed before enqueuing, remove idempotency key to allow retry
      await removeIdempotencyKey(eventId, amountMinor);
      
      // We return 500 so Stripe will retry
      res.status(500).send('Internal Server Error');
    }
  }
);

export default router;
