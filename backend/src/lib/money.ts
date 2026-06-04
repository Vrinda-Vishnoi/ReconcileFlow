// ──────────────────────────────────────────────
// dinero.js v2 — safe currency arithmetic
// No floating-point math on money. Ever.
// All amounts in smallest currency unit (paise for INR)
// ──────────────────────────────────────────────

import { dinero, toSnapshot, add, subtract, equal, greaterThan, lessThan } from 'dinero.js';
import { INR } from '@dinero.js/currencies';
import type { Dinero } from 'dinero.js';

export type Money = Dinero<number>;

/**
 * Create a Dinero object from a minor unit amount (paise).
 * DB stores BigInt, so we convert to number here.
 */
export function fromMinor(amountMinor: bigint | number): Money {
  const amount = typeof amountMinor === 'bigint' ? Number(amountMinor) : amountMinor;
  return dinero({ amount, currency: INR });
}

/**
 * Extract the minor unit amount from a Dinero object.
 */
export function toMinor(money: Money): bigint {
  const snapshot = toSnapshot(money);
  return BigInt(snapshot.amount);
}

/**
 * Add two money values.
 */
export function addMoney(a: Money, b: Money): Money {
  return add(a, b);
}

/**
 * Subtract b from a.
 */
export function subtractMoney(a: Money, b: Money): Money {
  return subtract(a, b);
}

/**
 * Check if two money values are equal.
 */
export function isEqual(a: Money, b: Money): boolean {
  return equal(a, b);
}

/**
 * Check if a is greater than b.
 */
export function isGreaterThan(a: Money, b: Money): boolean {
  return greaterThan(a, b);
}

/**
 * Check if a is less than b.
 */
export function isLessThan(a: Money, b: Money): boolean {
  return lessThan(a, b);
}

/**
 * Calculate the absolute difference between two amounts.
 */
export function absoluteDelta(a: Money, b: Money): bigint {
  const diff = toMinor(subtractMoney(a, b));
  return diff < 0n ? -diff : diff;
}

/**
 * Check if two amounts are within a percentage tolerance.
 * Used for fee-adjusted matching (within 1%).
 */
export function isWithinTolerance(a: bigint, b: bigint, tolerancePercent: number): boolean {
  if (a === 0n && b === 0n) return true;
  const larger = a > b ? a : b;
  const diff = a > b ? a - b : b - a;
  const threshold = (larger * BigInt(Math.round(tolerancePercent * 100))) / 10000n;
  return diff <= threshold;
}

/**
 * Format a minor amount as a human-readable string (e.g., ₹1,234.56).
 */
export function formatINR(amountMinor: bigint | number): string {
  const amt = typeof amountMinor === 'bigint' ? Number(amountMinor) : amountMinor;
  const rupees = amt / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(rupees);
}
