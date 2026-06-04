import { prisma } from '../lib/prisma';
import { createChildLogger } from '../lib/logger';

const log = createChildLogger('audit-service');

export interface AuditEntry {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after: unknown;
  reason?: string;
}

/**
 * Append an entry to the immutable audit log.
 * The audit_log table has a Postgres trigger that blocks UPDATE and DELETE.
 */
export async function logAuditEntry(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actor: entry.actor,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before as any ?? undefined,
        after: entry.after as any,
        reason: entry.reason,
      },
    });
    log.debug(
      { action: entry.action, entityType: entry.entityType, entityId: entry.entityId },
      'Audit log entry created'
    );
  } catch (error) {
    log.error({ err: error, entry }, 'Failed to write audit log entry');
    throw error;
  }
}

/**
 * Query audit log entries with optional filters.
 */
export async function getAuditEntries(filters: {
  entityType?: string;
  entityId?: string;
  actor?: string;
  action?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}) {
  const { entityType, entityId, actor, action, from, to, page = 1, limit = 50 } = filters;

  const where: any = {};
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (actor) where.actor = actor;
  if (action) where.action = action;
  if (from || to) {
    where.timestamp = {};
    if (from) where.timestamp.gte = from;
    if (to) where.timestamp.lte = to;
  }

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data: entries,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
