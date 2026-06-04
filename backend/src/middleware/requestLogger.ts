import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createChildLogger } from '../lib/logger';

const log = createChildLogger('http');

/**
 * Request logging middleware.
 * - Generates a unique X-Request-ID (UUID) for every request
 * - Logs method, path, status code, and duration
 * - Attaches the request ID to response headers for traceability
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  const startTime = Date.now();

  // Attach request ID to response headers
  res.setHeader('X-Request-ID', requestId);

  // Log when the response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    log.info({
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: duration,
    }, `${req.method} ${req.originalUrl} ${res.statusCode} — ${duration}ms`);
  });

  next();
}
