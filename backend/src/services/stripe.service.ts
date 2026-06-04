import Stripe from 'stripe';
import { createChildLogger } from '../lib/logger';

const log = createChildLogger('stripe-service');

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: '2024-12-18.acacia' as any,
    typescript: true,
  });

  return stripeClient;
}

/**
 * Verify Stripe webhook signature.
 * Raw body must be preserved (not JSON-parsed) for verification.
 */
export function constructWebhookEvent(
  rawBody: Buffer,
  signature: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }

  try {
    const stripe = getStripe();
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    log.error({ err: error }, 'Webhook signature verification failed');
    throw error;
  }
}

/**
 * Create a Stripe PaymentIntent (test mode).
 * Amount is in the smallest currency unit (paise for INR).
 */
export async function createPaymentIntent(
  amountMinor: number,
  currency: string = 'inr',
  metadata: Record<string, string> = {}
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountMinor,
    currency: currency.toLowerCase(),
    metadata,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never',
    },
  });

  log.info(
    { paymentIntentId: paymentIntent.id, amount: amountMinor, currency },
    'PaymentIntent created'
  );

  return paymentIntent;
}

/**
 * Confirm a PaymentIntent with a test payment method.
 * Uses the Stripe test card token for simulation.
 */
export async function confirmPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();

  const confirmed = await stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: 'pm_card_visa', // Stripe test card
  });

  log.info({ paymentIntentId, status: confirmed.status }, 'PaymentIntent confirmed');
  return confirmed;
}

/**
 * Route Stripe event types to human-readable actions.
 */
export function getEventAction(eventType: string): string {
  const mapping: Record<string, string> = {
    'payment_intent.succeeded': 'PAYMENT_SUCCEEDED',
    'payment_intent.payment_failed': 'PAYMENT_FAILED',
    'charge.succeeded': 'CHARGE_SUCCEEDED',
    'charge.refunded': 'CHARGE_REFUNDED',
    'charge.failed': 'CHARGE_FAILED',
    'charge.dispute.created': 'DISPUTE_CREATED',
  };
  return mapping[eventType] || `STRIPE_EVENT_${eventType.toUpperCase().replace(/\./g, '_')}`;
}
