import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Prisma ──
const mockCreate = vi.fn();

vi.mock('../lib/prisma', () => ({
  prisma: {
    auditLog: {
      create: (...args: any[]) => mockCreate(...args),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

// ── Mock Logger ──
vi.mock('../lib/logger', () => ({
  createChildLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { logAuditEntry, getAuditEntries } from '../services/audit.service';

describe('audit service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create an audit entry with all required fields', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'audit_1' });

    await logAuditEntry({
      actor: 'user_123',
      action: 'ORDER_CREATED',
      entityType: 'Order',
      entityId: 'order_456',
      after: { status: 'PENDING', amount: '50000' },
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor: 'user_123',
        action: 'ORDER_CREATED',
        entityType: 'Order',
        entityId: 'order_456',
        after: { status: 'PENDING', amount: '50000' },
      }),
    });
  });

  it('should include before/after snapshots when provided', async () => {
    mockCreate.mockResolvedValueOnce({ id: 'audit_2' });

    await logAuditEntry({
      actor: 'system',
      action: 'MANUAL_RESOLVE',
      entityType: 'ReconciliationMatch',
      entityId: 'match_789',
      before: { status: 'UNMATCHED' },
      after: { status: 'RESOLVED', resolvedReason: 'Manual fix' },
      reason: 'Operator resolved discrepancy',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor: 'system',
        action: 'MANUAL_RESOLVE',
        before: { status: 'UNMATCHED' },
        after: { status: 'RESOLVED', resolvedReason: 'Manual fix' },
        reason: 'Operator resolved discrepancy',
      }),
    });
  });

  it('should throw and propagate errors from Prisma', async () => {
    mockCreate.mockRejectedValueOnce(new Error('DB connection failed'));

    await expect(
      logAuditEntry({
        actor: 'system',
        action: 'TEST',
        entityType: 'Test',
        entityId: 'test_1',
        after: {},
      })
    ).rejects.toThrow('DB connection failed');
  });

  it('getAuditEntries should be callable and return paginated structure', async () => {
    const result = await getAuditEntries({ page: 1, limit: 10 });
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('pagination');
    expect(result.pagination).toHaveProperty('page', 1);
    expect(result.pagination).toHaveProperty('limit', 10);
  });
});
