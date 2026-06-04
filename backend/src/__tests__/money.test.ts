import { describe, it, expect } from 'vitest';
import {
  fromMinor,
  toMinor,
  isWithinTolerance,
  formatINR,
  absoluteDelta,
  isEqual,
  addMoney,
  subtractMoney,
} from '../lib/money';

describe('money utilities', () => {
  // ── fromMinor / toMinor round-trip ──

  it('should create a Dinero object from minor units and convert back', () => {
    const money = fromMinor(50000n);
    expect(toMinor(money)).toBe(50000n);
  });

  it('should handle number input in fromMinor', () => {
    const money = fromMinor(12345);
    expect(toMinor(money)).toBe(12345n);
  });

  it('should handle zero', () => {
    const money = fromMinor(0n);
    expect(toMinor(money)).toBe(0n);
  });

  // ── isWithinTolerance ──

  it('should return true when amounts are exactly equal', () => {
    expect(isWithinTolerance(10000n, 10000n, 1)).toBe(true);
  });

  it('should return true when amounts are within tolerance', () => {
    // 10000 and 10050 — difference is 50, which is 0.5% of 10050 → within 1%
    expect(isWithinTolerance(10000n, 10050n, 1)).toBe(true);
  });

  it('should return false when amounts exceed tolerance', () => {
    // 10000 and 10200 — difference is 200, which is ~1.96% → exceeds 1%
    expect(isWithinTolerance(10000n, 10200n, 1)).toBe(false);
  });

  it('should handle both values being zero', () => {
    expect(isWithinTolerance(0n, 0n, 1)).toBe(true);
  });

  // ── formatINR ──

  it('should format minor units as INR string', () => {
    const result = formatINR(123456n);
    // 123456 paise = ₹1,234.56
    expect(result).toContain('1,234.56');
  });

  it('should format number input', () => {
    const result = formatINR(50000);
    // 50000 paise = ₹500.00
    expect(result).toContain('500.00');
  });

  it('should format zero', () => {
    const result = formatINR(0);
    expect(result).toContain('0.00');
  });

  // ── absoluteDelta ──

  it('should return positive delta when a > b', () => {
    const a = fromMinor(10000n);
    const b = fromMinor(8000n);
    expect(absoluteDelta(a, b)).toBe(2000n);
  });

  it('should return positive delta when b > a', () => {
    const a = fromMinor(5000n);
    const b = fromMinor(8000n);
    expect(absoluteDelta(a, b)).toBe(3000n);
  });

  it('should return zero when amounts are equal', () => {
    const a = fromMinor(5000n);
    const b = fromMinor(5000n);
    expect(absoluteDelta(a, b)).toBe(0n);
  });

  // ── isEqual ──

  it('should return true for equal amounts', () => {
    expect(isEqual(fromMinor(100n), fromMinor(100n))).toBe(true);
  });

  it('should return false for different amounts', () => {
    expect(isEqual(fromMinor(100n), fromMinor(200n))).toBe(false);
  });

  // ── addMoney / subtractMoney ──

  it('should add two money values correctly', () => {
    const result = addMoney(fromMinor(3000n), fromMinor(2000n));
    expect(toMinor(result)).toBe(5000n);
  });

  it('should subtract two money values correctly', () => {
    const result = subtractMoney(fromMinor(5000n), fromMinor(2000n));
    expect(toMinor(result)).toBe(3000n);
  });
});
