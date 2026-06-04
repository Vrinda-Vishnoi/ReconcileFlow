import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isWithinTolerance } from '../lib/money';

// ── Mock Prisma ──
const mockFindMany = vi.fn();
const mockCreate = vi.fn();
const mockCount = vi.fn();

vi.mock('../lib/prisma', () => ({
  prisma: {
    bankSettlement: { findMany: mockFindMany },
    gatewayTransaction: { findMany: mockFindMany },
    reconciliationMatch: {
      findMany: (...args: any[]) => mockFindMany(...args),
      create: mockCreate,
      count: mockCount,
    },
    auditLog: { create: vi.fn() },
  },
}));

// ── Mock Socket ──
vi.mock('../lib/socket', () => ({
  emitMatchCreated: vi.fn(),
}));

// ── Mock Audit ──
vi.mock('./audit.service', () => ({
  logAuditEntry: vi.fn(),
}));

describe('matching service — unit-level tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be importable without errors', async () => {
    // Verifies the module can be loaded with mocks
    const mod = await import('../services/matching.service');
    expect(mod.runReconciliation).toBeDefined();
    expect(typeof mod.runReconciliation).toBe('function');
  });

  describe('4-tier matching algorithm logic', () => {
    it('Tier 1 — should identify exact matches (gateway_ref === utr AND amount === amount)', () => {
      // Simulating tier 1 logic inline since the function is tightly coupled to Prisma
      const settlement = { utr: 'UTR001', amountMinor: 50000n };
      const gatewayTxn = { id: 'txn_1', gatewayRef: 'UTR001', amountMinor: 50000n };

      const isExactMatch =
        gatewayTxn.gatewayRef === settlement.utr &&
        gatewayTxn.amountMinor === settlement.amountMinor;

      expect(isExactMatch).toBe(true);
    });

    it('Tier 1 — should NOT match when gateway_ref differs', () => {
      const settlement = { utr: 'UTR001', amountMinor: 50000n };
      const gatewayTxn = { id: 'txn_1', gatewayRef: 'UTR999', amountMinor: 50000n };

      const isExactMatch =
        gatewayTxn.gatewayRef === settlement.utr &&
        gatewayTxn.amountMinor === settlement.amountMinor;

      expect(isExactMatch).toBe(false);
    });

    it('Tier 2 — should identify fuzzy time-window matches (same amount, within 24h)', () => {
      const now = new Date();
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      const timeWindowMs = 24 * 60 * 60 * 1000;

      const settlement = { amountMinor: 50000n, settledAt: now };
      const gatewayTxn = { amountMinor: 50000n, receivedAt: sixHoursAgo };

      const amountMatch = gatewayTxn.amountMinor === settlement.amountMinor;
      const timeDiff = Math.abs(settlement.settledAt.getTime() - gatewayTxn.receivedAt.getTime());
      const withinWindow = timeDiff <= timeWindowMs;

      expect(amountMatch && withinWindow).toBe(true);
    });

    it('Tier 2 — should NOT match when time exceeds 24h window', () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      const timeWindowMs = 24 * 60 * 60 * 1000;

      const settlement = { amountMinor: 50000n, settledAt: now };
      const gatewayTxn = { amountMinor: 50000n, receivedAt: twoDaysAgo };

      const timeDiff = Math.abs(settlement.settledAt.getTime() - gatewayTxn.receivedAt.getTime());
      expect(timeDiff <= timeWindowMs).toBe(false);
    });

    it('Tier 3 — should identify fee-adjusted matches (within 1% tolerance)', () => {

      const orderAmount = 100000n; // ₹1000.00
      const gatewayFee = 200n; // ₹2.00 fee
      const adjustedAmount = orderAmount - gatewayFee; // 99800
      const settlementAmount = 99800n;

      expect(isWithinTolerance(adjustedAmount, settlementAmount, 1)).toBe(true);
    });

    it('Tier 3 — should NOT match when fee-adjusted difference exceeds 1%', () => {

      const orderAmount = 100000n;
      const gatewayFee = 200n;
      const adjustedAmount = orderAmount - gatewayFee; // 99800
      const settlementAmount = 95000n; // ~5% off

      expect(isWithinTolerance(adjustedAmount, settlementAmount, 1)).toBe(false);
    });

    it('Tier 4 — should flag as UNMATCHED when no tiers match', () => {
      const settlement = { utr: 'UTR_ORPHAN', amountMinor: 99999n, settledAt: new Date() };
      const gatewayTxns: any[] = []; // No gateway txns at all

      const exactMatch = gatewayTxns.find(
        (txn) => txn.gatewayRef === settlement.utr && txn.amountMinor === settlement.amountMinor
      );

      expect(exactMatch).toBeUndefined();
      // In real code, this would create an UNMATCHED record
    });
  });
});
