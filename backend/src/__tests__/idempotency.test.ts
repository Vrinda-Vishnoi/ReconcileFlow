import { describe, it, expect } from 'vitest';
import { generateIdempotencyKey } from '../services/idempotency.service';

describe('idempotency service', () => {
  // ── Determinism ──

  it('should produce the same key for the same inputs', () => {
    const key1 = generateIdempotencyKey('evt_123', '50000');
    const key2 = generateIdempotencyKey('evt_123', '50000');
    expect(key1).toBe(key2);
  });

  it('should produce the same key for number and equivalent string amount', () => {
    const keyStr = generateIdempotencyKey('evt_123', '50000');
    const keyNum = generateIdempotencyKey('evt_123', 50000);
    expect(keyStr).toBe(keyNum);
  });

  // ── Uniqueness ──

  it('should produce different keys for different event IDs', () => {
    const key1 = generateIdempotencyKey('evt_123', '50000');
    const key2 = generateIdempotencyKey('evt_456', '50000');
    expect(key1).not.toBe(key2);
  });

  it('should produce different keys for different amounts', () => {
    const key1 = generateIdempotencyKey('evt_123', '50000');
    const key2 = generateIdempotencyKey('evt_123', '60000');
    expect(key1).not.toBe(key2);
  });

  // ── Format ──

  it('should produce a 64-character hex string (SHA-256)', () => {
    const key = generateIdempotencyKey('evt_abc', '99999');
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should handle empty event ID gracefully', () => {
    const key = generateIdempotencyKey('', '50000');
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });
});
